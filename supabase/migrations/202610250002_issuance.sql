-- Durable issuance queue. Deploy with workers disabled; all transitions are transactional.
BEGIN;
CREATE TABLE IF NOT EXISTS public.events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, date_of_issue date NOT NULL DEFAULT current_date, certificate_type text NOT NULL DEFAULT 'certificate');
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS issuance_identity text;
CREATE UNIQUE INDEX IF NOT EXISTS certificates_issuance_identity ON certificates(issuance_identity) WHERE issuance_identity IS NOT NULL;
CREATE TABLE IF NOT EXISTS issuance_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid REFERENCES events, template_id uuid REFERENCES templates, creator uuid,
 payload_hash text NOT NULL, idempotency_key text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','running','paused','completed','needs_attention')),
 send_email boolean NOT NULL DEFAULT false, render_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS issuance_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES issuance_batches, recipient_key text NOT NULL, input jsonb NOT NULL,
 certificate_id uuid REFERENCES certificates, stage text NOT NULL DEFAULT 'issue' CHECK(stage IN ('issue','pdf','email','done')),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','retry','completed','failed','review_required','suppressed')),
 attempt_count int NOT NULL DEFAULT 0, max_attempts int NOT NULL DEFAULT 5, available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, owner text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), fencing_token bigint NOT NULL DEFAULT 0, last_error text, classification text, UNIQUE(batch_id,recipient_key)
);
CREATE INDEX IF NOT EXISTS issuance_items_claim ON issuance_items(state,available_at);
CREATE TABLE IF NOT EXISTS email_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES issuance_items, certificate_id uuid NOT NULL REFERENCES certificates,
 provider text NOT NULL, message_id text NOT NULL, outcome text NOT NULL DEFAULT 'sending' CHECK(outcome IN ('sending','accepted_by_provider','delivered','bounced','failed','ambiguous')),
 provider_id text, error text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_attempts ADD COLUMN IF NOT EXISTS recipient_email text;
ALTER TABLE email_attempts ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS job_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_id uuid REFERENCES issuance_batches, item_id uuid REFERENCES issuance_items, event text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS provider_pacing (provider text PRIMARY KEY, available_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS email_suppressions (email text PRIMARY KEY CHECK(email=lower(btrim(email))),reason text NOT NULL,blocked_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS delivery_events (event_id text NOT NULL,provider text NOT NULL,provider_id text NOT NULL,status text NOT NULL CHECK(status IN ('delivered','bounced')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_id));
CREATE TABLE IF NOT EXISTS api_rate_limits (key text PRIMARY KEY,window_started_at timestamptz NOT NULL DEFAULT now(),request_count int NOT NULL DEFAULT 0);
CREATE OR REPLACE FUNCTION consume_api_quota(p_key text,p_limit int DEFAULT 30) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE accepted text; BEGIN
 IF nullif(btrim(p_key),'') IS NULL OR length(p_key)>256 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid quota'; END IF;
 INSERT INTO api_rate_limits(key,request_count) VALUES(p_key,1) ON CONFLICT(key) DO UPDATE SET request_count=CASE WHEN api_rate_limits.window_started_at<clock_timestamp()-interval '1 minute' THEN 1 ELSE api_rate_limits.request_count+1 END,window_started_at=CASE WHEN api_rate_limits.window_started_at<clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE api_rate_limits.window_started_at END WHERE api_rate_limits.window_started_at<clock_timestamp()-interval '1 minute' OR api_rate_limits.request_count<p_limit RETURNING key INTO accepted;
 RETURN accepted IS NOT NULL;
END $$;
CREATE TABLE IF NOT EXISTS integration_credentials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, token_hash text UNIQUE NOT NULL, scopes text[] NOT NULL DEFAULT '{}', revoked_at timestamptz, window_started_at timestamptz NOT NULL DEFAULT now(), request_count int NOT NULL DEFAULT 0, requests_per_minute int NOT NULL DEFAULT 60 CHECK(requests_per_minute>0));
CREATE OR REPLACE FUNCTION consume_integration_quota(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ok uuid; BEGIN UPDATE integration_credentials SET request_count=CASE WHEN window_started_at < clock_timestamp()-interval '1 minute' THEN 1 ELSE request_count+1 END, window_started_at=CASE WHEN window_started_at < clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE window_started_at END WHERE id=p_id AND revoked_at IS NULL AND (window_started_at < clock_timestamp()-interval '1 minute' OR request_count<requests_per_minute) RETURNING id INTO ok; RETURN ok IS NOT NULL; END $$;
CREATE OR REPLACE FUNCTION refresh_issuance_batch(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 UPDATE issuance_batches b SET status=CASE WHEN EXISTS(SELECT 1 FROM issuance_items WHERE batch_id=b.id AND state IN ('failed','review_required')) THEN 'needs_attention' WHEN NOT EXISTS(SELECT 1 FROM issuance_items WHERE batch_id=b.id AND state NOT IN ('completed','suppressed')) THEN 'completed' ELSE 'running' END,updated_at=clock_timestamp() WHERE id=p_id AND status NOT IN ('draft','paused'); END $$;
CREATE OR REPLACE FUNCTION submit_issuance_batch(p_event_id uuid,p_template_id uuid,p_creator uuid,p_key text,p_hash text,p_recipients jsonb,p_snapshot jsonb,p_send_email bool,p_approved bool DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bid uuid; oldhash text; BEGIN
 IF p_recipients IS NULL OR jsonb_typeof(p_recipients)<>'array' OR jsonb_array_length(p_recipients) NOT BETWEEN 1 AND 10000 OR nullif(btrim(p_key),'') IS NULL OR nullif(btrim(p_hash),'') IS NULL THEN RAISE EXCEPTION 'Recipients required'; END IF;
 INSERT INTO issuance_batches(event_id,template_id,creator,idempotency_key,payload_hash,render_snapshot,send_email) VALUES(p_event_id,p_template_id,p_creator,p_key,p_hash,p_snapshot,p_send_email) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO bid;
 IF bid IS NULL THEN SELECT id,payload_hash INTO bid,oldhash FROM issuance_batches WHERE idempotency_key=p_key; IF oldhash<>p_hash THEN RAISE EXCEPTION 'Idempotency conflict'; END IF; RETURN bid; END IF;
 INSERT INTO issuance_items(batch_id,recipient_key,input) SELECT bid,coalesce(nullif(value->>'recipient_key',''),lower(value->>'email')),value FROM jsonb_array_elements(p_recipients);
 INSERT INTO job_events(batch_id,event) VALUES(bid,'submitted'); IF p_approved THEN PERFORM approve_issuance_batch(bid); END IF; RETURN bid; END $$;
CREATE OR REPLACE FUNCTION approve_issuance_batch(p_batch_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 UPDATE issuance_batches SET status='queued',updated_at=clock_timestamp() WHERE id=p_batch_id AND status='draft'; IF FOUND THEN INSERT INTO job_events(batch_id,event) VALUES(p_batch_id,'approved'); END IF; END $$;
CREATE OR REPLACE FUNCTION claim_issuance_item(p_worker text,p_lease_seconds int DEFAULT 120) RETURNS SETOF issuance_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r issuance_items; BEGIN
 IF p_lease_seconds NOT BETWEEN 1 AND 3600 OR nullif(p_worker,'') IS NULL THEN RAISE EXCEPTION 'Invalid lease'; END IF;
 -- An expired send intent can have reached SMTP: quarantine it before any reclaim.
 FOR r IN SELECT i.* FROM issuance_items i WHERE state='running' AND lease_until<=clock_timestamp() AND EXISTS(SELECT 1 FROM email_attempts a WHERE a.item_id=i.id AND a.outcome='sending') FOR UPDATE SKIP LOCKED LOOP
 UPDATE email_attempts SET outcome='ambiguous',updated_at=clock_timestamp() WHERE item_id=r.id AND outcome='sending';
 UPDATE issuance_items SET state='review_required',classification='ambiguous',owner=NULL,lease_until=NULL WHERE id=r.id;
 INSERT INTO job_events(batch_id,item_id,event) VALUES(r.batch_id,r.id,'send_intent_expired'); PERFORM refresh_issuance_batch(r.batch_id);
 END LOOP;
 FOR r IN SELECT i.* FROM issuance_items i WHERE state='running' AND lease_until<=clock_timestamp() AND stage='email' AND EXISTS(SELECT 1 FROM email_attempts a WHERE a.item_id=i.id AND a.outcome IN ('accepted_by_provider','delivered')) FOR UPDATE SKIP LOCKED LOOP
 UPDATE issuance_items SET stage='done',state='completed',owner=NULL,lease_until=NULL WHERE id=r.id;
 INSERT INTO job_events(batch_id,item_id,event) VALUES(r.batch_id,r.id,'accepted_email_recovered'); PERFORM refresh_issuance_batch(r.batch_id);
 END LOOP;
 FOR r IN SELECT i.* FROM issuance_items i WHERE state='running' AND lease_until<=clock_timestamp() AND attempt_count>=max_attempts FOR UPDATE SKIP LOCKED LOOP
 UPDATE issuance_items SET state='failed',owner=NULL,lease_until=NULL,last_error='Lease expired; retry budget exhausted' WHERE id=r.id;
 INSERT INTO job_events(batch_id,item_id,event) VALUES(r.batch_id,r.id,'retry_exhausted'); PERFORM refresh_issuance_batch(r.batch_id);
 END LOOP;
 SELECT i.* INTO r FROM issuance_items i JOIN issuance_batches b ON b.id=i.batch_id WHERE b.status IN ('queued','running','needs_attention') AND ((i.state IN ('queued','retry') AND i.available_at<=clock_timestamp()) OR (i.state='running' AND i.lease_until<=clock_timestamp())) AND i.attempt_count<i.max_attempts ORDER BY i.available_at,i.id FOR UPDATE OF i SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE issuance_items SET state='running',owner=p_worker,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),fencing_token=fencing_token+1,attempt_count=attempt_count+1 WHERE id=r.id RETURNING * INTO r;
 -- Batch display state must not serialize independent item claims behind a held batch lock.
 UPDATE issuance_batches b SET status='running' WHERE b.id IN (
  SELECT claimed_batch.id FROM issuance_batches claimed_batch
  WHERE claimed_batch.id=r.batch_id AND claimed_batch.status='queued' FOR NO KEY UPDATE SKIP LOCKED
 );
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(r.batch_id,r.id,'claimed',jsonb_build_object('worker',p_worker,'fence',r.fencing_token)); RETURN NEXT r; END $$;
CREATE OR REPLACE FUNCTION lock_issuance_item(p_id uuid,p_worker text,p_fence bigint) RETURNS issuance_items LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r issuance_items; BEGIN SELECT * INTO r FROM issuance_items WHERE id=p_id FOR UPDATE; IF NOT FOUND OR r.state<>'running' OR r.owner IS DISTINCT FROM p_worker OR r.fencing_token<>p_fence OR r.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Stale or expired lease'; END IF; RETURN r; END $$;
CREATE OR REPLACE FUNCTION heartbeat_issuance_item(p_id uuid,p_worker text,p_fence bigint,p_lease_seconds int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN IF p_lease_seconds NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'Invalid lease'; END IF; PERFORM lock_issuance_item(p_id,p_worker,p_fence); UPDATE issuance_items SET lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds) WHERE id=p_id; RETURN true; END $$;
CREATE OR REPLACE FUNCTION complete_issuance_stage(p_id uuid,p_worker text,p_fence bigint,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r issuance_items; b issuance_batches; e events; cid uuid; fid uuid; ident text; nextstage text; BEGIN
 r:=lock_issuance_item(p_id,p_worker,p_fence); SELECT * INTO b FROM issuance_batches WHERE id=r.batch_id;
 IF r.stage='issue' THEN
 SELECT * INTO STRICT e FROM events WHERE id=b.event_id;
 e.name:=coalesce(b.render_snapshot->'event'->>'name',e.name);
 e.date_of_issue:=coalesce((b.render_snapshot->'event'->>'date_of_issue')::date,e.date_of_issue);
 e.certificate_type:=coalesce(b.render_snapshot->'event'->>'certificate_type',e.certificate_type);
 ident:=e.id::text||':'||r.recipient_key||':'||e.certificate_type;
 fid:=nullif(r.input->>'folder_id','')::uuid; IF fid IS NULL THEN INSERT INTO folders(name) VALUES(e.name) ON CONFLICT DO NOTHING; SELECT id INTO fid FROM folders WHERE parent_id IS NULL AND lower(name)=lower(e.name) LIMIT 1; END IF;
 INSERT INTO certificates(certificate_code,name,email,event_name,date_of_issue,template_id,folder_id,custom_fields,render_snapshot,idempotency_key,issuance_identity) VALUES(upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),r.input->>'name',r.input->>'email',e.name,e.date_of_issue,b.template_id,fid,coalesce(r.input->'custom_fields','{}'),b.render_snapshot,ident,ident) ON CONFLICT(issuance_identity) WHERE issuance_identity IS NOT NULL DO UPDATE SET issuance_identity=excluded.issuance_identity
 WHERE certificates.name IS NOT DISTINCT FROM excluded.name AND certificates.email IS NOT DISTINCT FROM excluded.email
 AND certificates.template_id IS NOT DISTINCT FROM excluded.template_id AND coalesce(certificates.custom_fields,'{}')=excluded.custom_fields
 AND certificates.event_name=excluded.event_name AND certificates.date_of_issue=excluded.date_of_issue
 RETURNING id INTO cid;
 IF cid IS NULL THEN RAISE EXCEPTION 'Issuance identity conflict'; END IF;
 nextstage:='pdf'; UPDATE issuance_items SET certificate_id=cid WHERE id=p_id;
 ELSIF r.stage='pdf' THEN
 IF nullif(p_result->>'object_path','') IS NULL OR coalesce(p_result->>'sha256','') !~ '^[a-fA-F0-9]{64}$' THEN RAISE EXCEPTION 'Invalid PDF artifact'; END IF;
 UPDATE certificates SET pdf_object_path=p_result->>'object_path',pdf_sha256=p_result->>'sha256',render_snapshot=coalesce(render_snapshot,p_result->'render_snapshot',b.render_snapshot),pdf_url=p_result->>'pdf_url' WHERE id=r.certificate_id;
 nextstage:=CASE WHEN b.send_email THEN 'email' ELSE 'done' END;
 ELSIF r.stage='email' THEN
 IF NOT EXISTS(SELECT 1 FROM email_attempts WHERE item_id=r.id AND outcome IN ('accepted_by_provider','delivered')) THEN RAISE EXCEPTION 'Email acceptance required'; END IF; nextstage:='done';
 ELSE RAISE EXCEPTION 'Invalid stage'; END IF;
 UPDATE issuance_items SET stage=nextstage,state=CASE WHEN nextstage='done' THEN 'completed' ELSE 'queued' END,attempt_count=0,owner=NULL,lease_until=NULL,available_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(r.batch_id,p_id,'stage_completed',jsonb_build_object('stage',r.stage,'next',nextstage)); PERFORM refresh_issuance_batch(r.batch_id); END $$;
CREATE OR REPLACE FUNCTION fail_issuance_item(p_id uuid,p_worker text,p_fence bigint,p_error text,p_class text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r issuance_items; ambiguous bool; BEGIN
 r:=lock_issuance_item(p_id,p_worker,p_fence);
 IF EXISTS(SELECT 1 FROM email_attempts WHERE item_id=p_id AND outcome IN ('accepted_by_provider','delivered')) THEN
 UPDATE issuance_items SET stage='done',state='completed',owner=NULL,lease_until=NULL,last_error=NULL,classification=NULL WHERE id=p_id;
 INSERT INTO job_events(batch_id,item_id,event) VALUES(r.batch_id,p_id,'accepted_email_recovered'); PERFORM refresh_issuance_batch(r.batch_id); RETURN;
 END IF;
 SELECT EXISTS(SELECT 1 FROM email_attempts WHERE item_id=p_id AND outcome IN ('sending','ambiguous')) INTO ambiguous;
 UPDATE email_attempts SET outcome='ambiguous',updated_at=clock_timestamp() WHERE item_id=p_id AND outcome='sending';
 UPDATE issuance_items SET state=CASE WHEN ambiguous OR p_class='ambiguous' THEN 'review_required' WHEN p_class IN ('permanent','revoked') OR attempt_count>=max_attempts THEN 'failed' ELSE 'retry' END,last_error=p_error,classification=p_class,owner=NULL,lease_until=NULL,available_at=clock_timestamp()+make_interval(secs=>least(3600,power(2,attempt_count)::int*5+floor(random()*5)::int)) WHERE id=p_id;
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(r.batch_id,p_id,'failed',jsonb_build_object('classification',p_class,'error',p_error)); PERFORM refresh_issuance_batch(r.batch_id); END $$;
CREATE OR REPLACE FUNCTION control_issuance_batch(p_batch_id uuid,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM 1 FROM issuance_batches WHERE id=p_batch_id FOR UPDATE;
 IF p_action='pause' THEN UPDATE issuance_batches SET status='paused' WHERE id=p_batch_id AND status<>'draft';
 ELSIF p_action='resume' THEN UPDATE issuance_batches SET status='queued' WHERE id=p_batch_id AND status='paused';
 ELSIF p_action='retry' THEN UPDATE issuance_items i SET state='queued',attempt_count=0,available_at=clock_timestamp() WHERE batch_id=p_batch_id AND state='failed' AND classification IS DISTINCT FROM 'revoked' AND NOT EXISTS(SELECT 1 FROM email_attempts a WHERE a.item_id=i.id AND outcome IN ('sending','ambiguous','accepted_by_provider','delivered')); UPDATE issuance_batches SET status='queued' WHERE id=p_batch_id AND status NOT IN ('draft','paused');
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 INSERT INTO job_events(batch_id,event,metadata) VALUES(p_batch_id,'control',jsonb_build_object('action',p_action)); END $$;
DROP FUNCTION IF EXISTS begin_email_attempt(uuid,text,bigint,text,text,int);
CREATE OR REPLACE FUNCTION begin_email_attempt(p_id uuid,p_worker text,p_fence bigint,p_provider text,p_message_id text,p_cooldown_ms int,p_envelope jsonb DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r issuance_items; c certificates; aid uuid; slot timestamptz; frozen jsonb; BEGIN
 r:=lock_issuance_item(p_id,p_worker,p_fence);
 PERFORM 1 FROM issuance_batches WHERE id=r.batch_id FOR UPDATE;
 IF r.stage<>'email' OR NOT EXISTS(SELECT 1 FROM issuance_batches WHERE id=r.batch_id AND status NOT IN ('draft','paused')) THEN RAISE EXCEPTION 'Email unavailable or batch paused'; END IF;
 SELECT * INTO c FROM certificates WHERE id=r.certificate_id AND is_valid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Certificate revoked'; END IF;
 IF p_envelope IS NULL OR jsonb_typeof(p_envelope)<>'object' THEN RAISE EXCEPTION 'Invalid email envelope'; END IF;
 IF p_envelope<>'{}' AND (p_envelope->>'name' IS DISTINCT FROM c.name OR p_envelope->>'email' IS DISTINCT FROM c.email OR p_envelope->>'event_name' IS DISTINCT FROM c.event_name OR p_envelope->>'certificate_code' IS DISTINCT FROM c.certificate_code OR p_envelope->'message'->>'to' IS DISTINCT FROM c.email) THEN RAISE EXCEPTION 'Recipient changed; review required'; END IF;
 frozen:=p_envelope||jsonb_build_object('name',c.name,'email',c.email,'event_name',c.event_name,'certificate_code',c.certificate_code);
 IF EXISTS(SELECT 1 FROM certificates sc JOIN email_suppressions s ON s.email=lower(btrim(sc.email)) WHERE sc.id=r.certificate_id) THEN RAISE EXCEPTION 'Recipient suppressed'; END IF;
 IF EXISTS(SELECT 1 FROM email_attempts WHERE certificate_id=r.certificate_id AND outcome IN ('sending','ambiguous')) THEN RAISE EXCEPTION 'Email requires review'; END IF;
 IF NOT coalesce((r.input->>'explicit_resend')::boolean,false) AND (c.email_sent OR EXISTS(SELECT 1 FROM email_attempts WHERE certificate_id=r.certificate_id AND outcome IN ('accepted_by_provider','delivered') AND (recipient_email IS NULL OR lower(btrim(recipient_email))=lower(btrim(c.email))))) THEN RAISE EXCEPTION 'Already accepted'; END IF;
 IF p_cooldown_ms NOT BETWEEN 0 AND 3600000 THEN RAISE EXCEPTION 'Invalid cooldown'; END IF;
 INSERT INTO provider_pacing VALUES(p_provider,clock_timestamp()) ON CONFLICT DO NOTHING;
 SELECT available_at INTO slot FROM provider_pacing WHERE provider=p_provider FOR UPDATE;
 IF slot>clock_timestamp() THEN RETURN NULL; END IF;
 UPDATE provider_pacing SET available_at=clock_timestamp()+p_cooldown_ms*interval '1 millisecond' WHERE provider=p_provider;
 INSERT INTO email_attempts(item_id,certificate_id,provider,message_id,recipient_email,payload) VALUES(p_id,r.certificate_id,p_provider,p_message_id,c.email,frozen) RETURNING id INTO aid;
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(r.batch_id,p_id,'email_intent',jsonb_build_object('attempt_id',aid,'explicit_resend',coalesce(r.input->'explicit_resend','false'))); RETURN aid; END $$;
CREATE OR REPLACE FUNCTION finish_email_attempt(p_id uuid,p_worker text,p_fence bigint,p_attempt_id uuid,p_outcome text,p_provider_id text,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r issuance_items; BEGIN
 r:=lock_issuance_item(p_id,p_worker,p_fence); IF p_outcome NOT IN ('accepted_by_provider','failed','ambiguous') THEN RAISE EXCEPTION 'Invalid send outcome'; END IF;
 UPDATE email_attempts SET outcome=p_outcome,provider_id=p_provider_id,error=p_error,updated_at=clock_timestamp() WHERE id=p_attempt_id AND item_id=p_id AND outcome='sending'; IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or finished attempt'; END IF;
 IF p_outcome='accepted_by_provider' THEN UPDATE certificates SET email_sent=true,email_sent_at=clock_timestamp() WHERE id=r.certificate_id;
 ELSIF p_outcome='ambiguous' THEN UPDATE issuance_items SET state='review_required',classification='ambiguous',owner=NULL,lease_until=NULL WHERE id=p_id; PERFORM refresh_issuance_batch(r.batch_id); END IF;
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(r.batch_id,p_id,'email_outcome',jsonb_build_object('outcome',p_outcome,'attempt_id',p_attempt_id)); END $$;
CREATE OR REPLACE FUNCTION enqueue_existing_email(p_certificate_ids uuid[],p_creator uuid,p_key text,p_resend bool) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE bid uuid; h text; oldhash text; BEGIN
 h:=md5(p_certificate_ids::text||p_resend::text);
 INSERT INTO issuance_batches(creator,payload_hash,idempotency_key,status,send_email,render_snapshot) VALUES(p_creator,h,p_key,'queued',true,'{}') ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO bid;
 IF bid IS NULL THEN SELECT id,payload_hash INTO bid,oldhash FROM issuance_batches WHERE idempotency_key=p_key; IF oldhash<>h THEN RAISE EXCEPTION 'Idempotency conflict'; END IF; RETURN bid; END IF;
 -- Lock before the INSERT statement so its READ COMMITTED snapshot sees a prior enqueue.
 PERFORM 1 FROM certificates WHERE id=ANY(p_certificate_ids) ORDER BY id FOR UPDATE;
 INSERT INTO issuance_items(batch_id,recipient_key,input,certificate_id,stage,state)
 SELECT bid,c.id::text,jsonb_build_object('explicit_resend',p_resend),c.id,'email',CASE WHEN NOT c.is_valid THEN 'suppressed' WHEN EXISTS(SELECT 1 FROM email_attempts a WHERE a.certificate_id=c.id AND outcome IN ('sending','ambiguous')) THEN 'review_required' WHEN EXISTS(SELECT 1 FROM issuance_items i WHERE i.certificate_id=c.id AND stage='email' AND state IN ('queued','running','retry')) THEN 'suppressed' WHEN NOT p_resend AND (c.email_sent OR EXISTS(SELECT 1 FROM email_attempts a WHERE a.certificate_id=c.id AND outcome IN ('accepted_by_provider','delivered') AND (a.recipient_email IS NULL OR lower(btrim(a.recipient_email))=lower(btrim(c.email))))) THEN 'suppressed' ELSE 'queued' END FROM certificates c WHERE c.id=ANY(p_certificate_ids) FOR UPDATE OF c;
 INSERT INTO job_events(batch_id,event,metadata) VALUES(bid,'manual_email_enqueued',jsonb_build_object('resend',p_resend)); PERFORM refresh_issuance_batch(bid); RETURN bid; END $$;
-- Only trusted service clients mutate queue state; administrators can inspect it.
CREATE OR REPLACE FUNCTION guard_certificate_email_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.email IS DISTINCT FROM OLD.email THEN
 IF EXISTS(SELECT 1 FROM email_attempts WHERE certificate_id=OLD.id AND outcome IN ('sending','ambiguous')) OR EXISTS(SELECT 1 FROM issuance_items WHERE certificate_id=OLD.id AND state='review_required') THEN RAISE EXCEPTION 'Email intent active; review required'; END IF;
 NEW.email_sent:=false; NEW.email_sent_at:=NULL;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS certificate_email_change_guard ON certificates;
CREATE TRIGGER certificate_email_change_guard BEFORE UPDATE OF email ON certificates FOR EACH ROW EXECUTE FUNCTION guard_certificate_email_change();
CREATE OR REPLACE FUNCTION update_certificate_email(p_id uuid,p_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF p_email IS NULL OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid email'; END IF;
 PERFORM 1 FROM certificates WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
 UPDATE certificates SET email=btrim(p_email) WHERE id=p_id;
 INSERT INTO job_events(event,metadata) VALUES('certificate_email_updated',jsonb_build_object('certificate_id',p_id));
END $$;
CREATE OR REPLACE FUNCTION skip_issuance_item(p_id uuid,p_worker text,p_fence bigint,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r issuance_items; BEGIN
 r:=lock_issuance_item(p_id,p_worker,p_fence);
 IF EXISTS(SELECT 1 FROM email_attempts WHERE item_id=p_id AND outcome IN ('sending','ambiguous')) THEN RAISE EXCEPTION 'Cannot suppress uncertain delivery'; END IF;
 UPDATE issuance_items SET state='suppressed',owner=NULL,lease_until=NULL,classification=p_reason WHERE id=p_id;
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(r.batch_id,p_id,'suppressed',jsonb_build_object('reason',p_reason)); PERFORM refresh_issuance_batch(r.batch_id);
END $$;
CREATE OR REPLACE FUNCTION defer_issuance_item(p_id uuid,p_worker text,p_fence bigint,p_seconds int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r issuance_items; BEGIN
 r:=lock_issuance_item(p_id,p_worker,p_fence);
 IF p_seconds NOT BETWEEN 1 AND 3600 OR EXISTS(SELECT 1 FROM email_attempts WHERE item_id=p_id AND outcome='sending') THEN RAISE EXCEPTION 'Unsafe deferral'; END IF;
 UPDATE issuance_items SET state='retry',owner=NULL,lease_until=NULL,attempt_count=greatest(0,attempt_count-1),available_at=clock_timestamp()+make_interval(secs=>p_seconds) WHERE id=p_id;
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(r.batch_id,p_id,'deferred',jsonb_build_object('seconds',p_seconds));
END $$;
CREATE OR REPLACE FUNCTION record_delivery_event(p_event_id text,p_provider text,p_provider_id text,p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE a email_attempts; bid uuid; BEGIN
 IF p_status NOT IN ('delivered','bounced') OR nullif(p_event_id,'') IS NULL OR nullif(p_provider_id,'') IS NULL THEN RAISE EXCEPTION 'Invalid delivery event'; END IF;
 SELECT * INTO a FROM email_attempts WHERE provider=p_provider AND provider_id=p_provider_id AND outcome IN ('accepted_by_provider','delivered','bounced') ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown accepted provider message'; END IF;
 INSERT INTO delivery_events(event_id,provider,provider_id,status) VALUES(p_event_id,p_provider,p_provider_id,p_status) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN; END IF;
 IF a.outcome='bounced' THEN RETURN; END IF;
 UPDATE email_attempts SET outcome=p_status,updated_at=clock_timestamp() WHERE id=a.id;
 IF p_status='bounced' THEN INSERT INTO email_suppressions(email,reason) SELECT lower(btrim(coalesce(a.recipient_email,email))),'provider_bounce' FROM certificates WHERE id=a.certificate_id ON CONFLICT(email) DO NOTHING; END IF;
 SELECT batch_id INTO bid FROM issuance_items WHERE id=a.item_id;
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(bid,a.item_id,'delivery_'||p_status,jsonb_build_object('attempt_id',a.id,'provider_event_id',p_event_id));
END $$;
CREATE OR REPLACE FUNCTION reconcile_email_attempt(p_attempt_id uuid,p_outcome text,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a email_attempts; r issuance_items; BEGIN
 IF p_outcome NOT IN ('accepted_by_provider','failed') OR length(btrim(coalesce(p_note,'')))<10 THEN RAISE EXCEPTION 'Confirmed outcome and reconciliation note required'; END IF;
 SELECT * INTO STRICT a FROM email_attempts WHERE id=p_attempt_id;
 SELECT * INTO STRICT r FROM issuance_items WHERE id=a.item_id FOR UPDATE;
 SELECT * INTO STRICT a FROM email_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF a.outcome<>'ambiguous' OR r.state<>'review_required' THEN RAISE EXCEPTION 'Only ambiguous attempts may be reconciled'; END IF;
 UPDATE email_attempts SET outcome=p_outcome,error=p_note,metadata=metadata||jsonb_build_object('reconciled',true,'note',p_note),updated_at=clock_timestamp() WHERE id=p_attempt_id;
 IF p_outcome='accepted_by_provider' THEN
 UPDATE certificates SET email_sent=true,email_sent_at=clock_timestamp() WHERE id=a.certificate_id;
 UPDATE issuance_items SET stage='done',state='completed',classification=NULL,last_error=NULL,updated_at=clock_timestamp() WHERE id=r.id;
 ELSE
 UPDATE issuance_items SET state='failed',classification='confirmed_not_accepted',last_error=p_note,updated_at=clock_timestamp() WHERE id=r.id;
 END IF;
 INSERT INTO job_events(batch_id,item_id,event,metadata) VALUES(r.batch_id,r.id,'email_reconciled',jsonb_build_object('attempt_id',p_attempt_id,'outcome',p_outcome,'note',p_note));
 PERFORM refresh_issuance_batch(r.batch_id);
END $$;
DROP TRIGGER IF EXISTS issuance_items_updated_at ON issuance_items;
CREATE TRIGGER issuance_items_updated_at BEFORE UPDATE ON issuance_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['events','issuance_batches','issuance_items','email_attempts','job_events','provider_pacing','integration_credentials','email_suppressions','delivery_events','api_rate_limits'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM anon,authenticated',t);
 EXECUTE format('GRANT ALL ON %I TO service_role',t);
 IF t NOT IN ('integration_credentials','email_suppressions','delivery_events','api_rate_limits') THEN EXECUTE format('GRANT SELECT ON %I TO authenticated',t); END IF;
 EXECUTE format('DROP POLICY IF EXISTS admin_read ON %I',t);
 EXECUTE format('CREATE POLICY admin_read ON %I FOR SELECT TO authenticated USING (public.is_admin())',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY['consume_integration_quota','refresh_issuance_batch','submit_issuance_batch','approve_issuance_batch','claim_issuance_item','lock_issuance_item','heartbeat_issuance_item','complete_issuance_stage','fail_issuance_item','control_issuance_batch','begin_email_attempt','finish_email_attempt','enqueue_existing_email','reconcile_email_attempt','defer_issuance_item','record_delivery_event','consume_api_quota','skip_issuance_item','update_certificate_email','guard_certificate_email_change']) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE UPDATE,DELETE,TRUNCATE ON job_events FROM service_role;
COMMIT;







