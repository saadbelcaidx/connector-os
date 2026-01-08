/**
 * SSMVerifyService.ts
 *
 * Integration with SSMasters email verification platform.
 * Used as fallback when Anymail Finder fails.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SSM_PROXY_URL = `${SUPABASE_URL}/functions/v1/ssm-verify`;

export interface SSMVerifyResult {
  success: boolean;
  email?: string;
  status: 'verified' | 'risky' | 'invalid' | 'error';
  serviceProvider?: string;
}

export interface SSMFindResult {
  success: boolean;
  email?: string;
  emailsFound: number;
}

/**
 * Verify a single email using SSMasters
 */
export async function ssmVerifyEmail(
  apiKey: string,
  email: string
): Promise<SSMVerifyResult> {
  console.log(`[SSMVerify] Verifying email: ${email}`);

  if (!apiKey || !email) {
    console.error('[SSMVerify] Missing required parameters');
    return { success: false, status: 'error' };
  }

  try {
    const response = await fetch(SSM_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type: 'verify_single',
        apiKey,
        email,
      }),
    });

    if (!response.ok) {
      console.error('[SSMVerify] API error:', response.status);
      return { success: false, status: 'error' };
    }

    const data = await response.json();

    if (data.success && data.verification_status) {
      console.log(`[SSMVerify] Email ${email}: ${data.verification_status}`);
      return {
        success: true,
        email: data.email,
        status: data.verification_status,
        serviceProvider: data.serviceProvider,
      };
    }

    return { success: false, status: 'error' };
  } catch (err) {
    console.error('[SSMVerify] Error:', err);
    return { success: false, status: 'error' };
  }
}

/**
 * Find email by name + domain using SSMasters
 */
export async function ssmFindEmail(
  apiKey: string,
  firstName: string,
  lastName: string,
  domain: string
): Promise<SSMFindResult> {
  console.log(`[SSMVerify] Finding email for ${firstName} ${lastName} at ${domain}`);

  if (!apiKey || !firstName || !lastName || !domain) {
    console.error('[SSMVerify] Missing required parameters');
    return { success: false, emailsFound: 0 };
  }

  try {
    const response = await fetch(SSM_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type: 'find_single',
        apiKey,
        firstName,
        lastName,
        domain,
      }),
    });

    if (!response.ok) {
      console.error('[SSMVerify] API error:', response.status);
      return { success: false, emailsFound: 0 };
    }

    const data = await response.json();

    if (data.success && data.email) {
      console.log(`[SSMVerify] Found email: ${data.email}`);
      return {
        success: true,
        email: data.email,
        emailsFound: data.emailsFound || 1,
      };
    }

    console.log(`[SSMVerify] No email found for ${firstName} ${lastName} at ${domain}`);
    return { success: false, emailsFound: 0 };
  } catch (err) {
    console.error('[SSMVerify] Error:', err);
    return { success: false, emailsFound: 0 };
  }
}
