// Database types for the Certificate Verification System

/**
 * Custom placeholder configuration for dynamic certificate fields
 * Allows templates to define arbitrary placeholders beyond name/event/date
 */
export interface Placeholder {
    key: string; // Field name in custom_fields (e.g., "achievement_level", "course_code")
    label: string; // Display name in template editor
    x: number; // X coordinate in pixels
    y: number; // Y coordinate in pixels
    width: number; // Width in pixels
    height: number; // Height in pixels
    fontSize: number; // Font size in pixels
    fontFamily: string; // Font family name
    alignment: 'left' | 'center' | 'right';
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color?: string;
    isLink: boolean; // If true, treat as clickable verification link area
}

export interface Template {
    id: string;
    name: string;
    image_url: string;
    // Custom fonts added by user (Google Font names)
    custom_fonts: string[];
    // Uploaded custom font files mapped by font family name to public URL
    custom_font_files?: Record<string, string>;
    // Link coordinates (clickable verification URL area)
    link_x: number;
    link_y: number;
    link_width: number;
    link_height: number;
    link_font_size: number;
    link_alignment: 'left' | 'center' | 'right';
    link_font_family: string;
    link_bold: boolean;
    link_italic: boolean;
    link_underline: boolean;
    link_color: string;
    // Name placement
    name_x: number;
    name_y: number;
    name_width: number;
    name_height: number;
    name_font_size: number;
    name_alignment: 'left' | 'center' | 'right';
    name_font_family: string;
    name_bold: boolean;
    name_italic: boolean;
    name_underline: boolean;
    name_color: string;
    // Event name placement (optional)
    event_x: number | null;
    event_y: number | null;
    event_width: number;
    event_height: number;
    event_font_size: number | null;
    event_alignment: 'left' | 'center' | 'right';
    event_font_family: string | null;
    event_bold: boolean;
    event_italic: boolean;
    event_underline: boolean;
    event_color: string;
    // Date placement (optional)
    date_x: number | null;
    date_y: number | null;
    date_width: number;
    date_height: number;
    date_font_size: number | null;
    date_alignment: 'left' | 'center' | 'right';
    date_font_family: string | null;
    date_bold: boolean;
    date_italic: boolean;
    date_underline: boolean;
    date_color: string;
    // Image dimensions
    image_width: number;
    image_height: number;
    // Custom placeholders (new feature)
    placeholders?: Placeholder[];
    created_at: string;
    updated_at: string;
}

export interface Folder {
    id: string;
    name: string;
    parent_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface Certificate {
    id: string;
    certificate_code: string;
    name: string;
    email: string;
    event_name: string;
    date_of_issue: string;
    template_id: string | null;
    folder_id: string;
    template_image_url: string | null;
    pdf_url: string | null;
    pdf_object_path?: string | null;
    pdf_sha256?: string | null;
    render_snapshot?: unknown;
    idempotency_key?: string | null;
    issuance_identity?: string | null;
    is_valid: boolean;
    email_sent: boolean;
    email_sent_at: string | null;
    // Custom fields mapped by placeholder key (new feature)
    custom_fields?: Record<string, string>;
    created_at: string;
    updated_at: string;
}

// Input types for creating/updating records
export interface CreateCertificateInput {
    name: string;
    email: string;
    event_name: string;
    date_of_issue?: string;
    template_id: string;
    folder_id: string;
    custom_fields?: Record<string, string>; // Custom placeholder values
}

export interface UpdateCertificateInput {
    name?: string;
    email?: string;
    event_name?: string;
    date_of_issue?: string;
    folder_id?: string;
    is_valid?: boolean;
}

export interface CreateTemplateInput {
    name: string;
    image_url: string;
    custom_fonts?: string[];
    custom_font_files?: Record<string, string>;
    placeholders?: Placeholder[]; // Custom placeholders
    link_x?: number;
    link_y?: number;
    link_width?: number;
    link_height?: number;
    link_font_size?: number;
    link_alignment?: 'left' | 'center' | 'right';
    link_font_family?: string;
    link_bold?: boolean;
    link_italic?: boolean;
    link_underline?: boolean;
    link_color?: string;
    name_x?: number;
    name_y?: number;
    name_width?: number;
    name_height?: number;
    name_font_size?: number;
    name_alignment?: 'left' | 'center' | 'right';
    name_font_family?: string;
    name_bold?: boolean;
    name_italic?: boolean;
    name_underline?: boolean;
    name_color?: string;
    event_x?: number | null;
    event_y?: number | null;
    event_width?: number;
    event_height?: number;
    event_font_size?: number | null;
    event_alignment?: 'left' | 'center' | 'right';
    event_font_family?: string | null;
    event_bold?: boolean;
    event_italic?: boolean;
    event_underline?: boolean;
    event_color?: string;
    date_x?: number | null;
    date_y?: number | null;
    date_width?: number;
    date_height?: number;
    date_font_size?: number | null;
    date_alignment?: 'left' | 'center' | 'right';
    date_font_family?: string | null;
    date_bold?: boolean;
    date_italic?: boolean;
    date_underline?: boolean;
    date_color?: string;
    image_width?: number;
    image_height?: number;
}

export interface UpdateTemplateInput extends Partial<CreateTemplateInput> {
    placeholders?: Placeholder[];
}

// API Response types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// Verification page data
export interface VerificationData {
    isValid: boolean;
    certificate?: {
        name: string;
        email: string;
        event_name: string;
        date_of_issue: string;
        certificate_code: string;
    };
}
