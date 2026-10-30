# Certificate Verification System – Detailed Plan

## 1. Objective

Build a secure, verifiable digital certificate system where:

* Each certificate contains a **clickable verification URL embedded at fixed coordinates** on a certificate image.
* Clicking the link opens a public verification page showing **Valid / Not Valid** status with certificate metadata.
* Admins can generate, manage, email, and download certificates as PDFs.

Stack:

* **Frontend**: Next.js (App Router)
* **Backend**: Node.js (API Routes / Server Actions)
* **Database & Auth**: Supabase
* **Email**: Gmail SMTP (App Password)

---

## 2. System Architecture Overview

```
Admin Panel (Next.js)
   |
   |-- Create Certificate Record
   |-- Upload Certificate Template Image
   |-- Generate PDF with Overlayed Link
   |-- Send Email to User
   |
Supabase (Postgres + Storage)
   |
   |-- certificates table
   |-- admin users
   |-- image templates
   |
Public Verification Page (Next.js)
   |
   |-- /verify/[code]
   |-- Shows Valid / Invalid Status
```

---

## 3. Database Design (Supabase)

### 3.1 `certificates` table

| Column             | Type          | Description               |
| ------------------ | ------------- | ------------------------- |
| id                 | uuid          | Primary key               |
| certificate_code   | text (unique) | Random verification code  |
| name               | text          | Recipient name            |
| email              | text          | Recipient email           |
| event_name         | text          | Event / course name       |
| date_of_issue      | date          | Issue date                |
| template_image_url | text          | Supabase storage URL      |
| pdf_url            | text          | Generated certificate PDF |
| is_valid           | boolean       | Revocation control        |
| created_at         | timestamp     | Auto                      |

Indexes:

* Unique index on `certificate_code`

---

### 3.2 `templates` table

| Column      | Type      | Description  |
| ----------- | --------- | ------------ |
| id          | uuid      |              |
| name        | text      |              |
| image_url   | text      |              |
| link_x      | integer   | X coordinate |
| link_y      | integer   | Y coordinate |
| link_width  | integer   |              |
| link_height | integer   |              |
| created_at  | timestamp |              |

---

## 4. Certificate Code Generation

* Use cryptographically secure random generation
* Length: 12–14 chars
* Uppercase alphanumeric

Example:

```
LDNYEW7K23BA
```

Implementation:

* `crypto.randomBytes()` → base32/hex encode
* Enforce uniqueness via DB constraint

---

## 5. Certificate Generation Pipeline

### Step-by-step Flow

1. Admin submits user details
2. Backend generates `certificate_code`
3. Verification URL formed:

```
https://yourdomain.org/verify/{certificate_code}
```

4. Admin selects certificate template
5. System overlays **invisible clickable hyperlink** at predefined coordinates
6. PDF generated and stored
7. PDF link saved in DB

---

## 6. PDF Generation Strategy

### Libraries

* `pdf-lib` (recommended)
* `node-canvas` (optional, if raster processing needed)

### Overlay Logic

* Load template image
* Create PDF page with same dimensions
* Draw image as background
* Add transparent rectangle with hyperlink

Pseudo-flow:

```
PDFDocument.load()
page.drawImage(template)
page.drawRectangle({ opacity: 0, link: verificationUrl })
```

Important:

* Link must be **transparent but clickable**
* Coordinates must scale correctly for DPI

---

## 7. Public Verification Page

### Route

```
/verify/[certificate_code]
```

### Logic

1. Extract `certificate_code`
2. Query Supabase
3. If found AND `is_valid = true` → VALID screen
4. Else → NOT VALID screen

### Display Fields

* Status (Valid / Invalid)
* Name
* Email
* Event name
* Date of issue
* Certificate code

Security:

* Read-only
* No authentication

---

## 8. Admin Panel Features

### Authentication

* Supabase Auth (Email + Password)
* Admin-only access

### Screens

#### 1. Dashboard

* Total certificates
* Recently generated

#### 2. Create Certificate

* Name
* Email
* Event name
* Date of issue
* Select template

#### 3. Template Manager

* Upload certificate image
* Define link coordinates visually (click-to-place)
* Save template

#### 4. Certificate Actions

* Generate PDF
* Download PDF
* Send via Email
* Revoke certificate

---

## 9. Email Delivery (Gmail SMTP)

### Setup

* Enable 2FA on Gmail
* Generate App Password

### Library

* `nodemailer`

### Email Content

* Subject: Certificate of Completion
* Body:

  * User name
  * Event name
  * Download PDF link
  * Verification link

---

## 10. File Storage

* Supabase Storage buckets

  * `/templates`
  * `/certificates`

Public access:

* Templates: private
* Certificates: signed URLs (time-limited)

---

## 11. Security & Validation

* Server-side validation for all inputs
* Admin-only certificate creation
* Rate-limit verification endpoint
* HTTPS mandatory

---

## 12. Error Handling

* Duplicate certificate codes → regenerate
* PDF generation failure → retry + log
* Email failure → fallback manual download

---

## 13. Deployment Notes

* Use environment variables
* Separate dev/prod Supabase projects
* Enable logging for PDF + email services

---

## 14. Milestone Breakdown

1. Supabase schema & auth
2. Admin panel UI
3. Template upload & coordinate selection
4. Certificate code generation
5. PDF generation with hyperlink
6. Verification page
7. Email integration
8. Final QA

---

## 15. Success Criteria

* Clickable link works in PDF
* Verification page loads instantly
* Admin can generate certificates end-to-end in <30 seconds
* Zero false positives in validation
* 

---

END OF PLAN
