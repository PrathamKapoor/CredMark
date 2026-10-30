/** Compatibility adapter: PostgreSQL issuance items are the sole queue authority. */
export {enqueueManualEmails as enqueueBulkEmailJob} from '@/lib/issuance/service';
