/**
 * Ruling #4: deny-list check against known-breached/common passwords.
 * STARTER SET — the well-known most-common passwords (lowercased compare;
 * candidates are also checked with digits-for-letters normalisation left to
 * a future pass). Expanding this list is data, not code; a fuller offline
 * corpus can replace it without touching the policy.
 */
const DENIED = new Set(
  [
    '123456', '123456789', '12345678', '1234567890', 'qwerty', 'qwertyuiop',
    'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'letmein',
    '111111', '123123', 'abc123', 'iloveyou', 'admin', 'welcome', 'welcome1',
    'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball',
    'superman', 'batman', 'trustno1', 'shadow', 'master', 'michael', 'jennifer',
    'jordan', 'harley', 'ranger', 'hunter', 'buster', 'soccer', 'hockey',
    'killer', 'george', 'charlie', 'andrew', 'thomas', 'robert', 'daniel',
    'matthew', 'jessica', 'ashley', 'amanda', 'nicole', 'chelsea', 'biteme',
    'access', 'yankees', 'dallas', 'austin', 'starwars', 'liverpool', 'chelsea1',
    'arsenal', 'united', 'england', 'london', 'secret', 'freedom', 'whatever',
    'qazwsx', 'zxcvbnm', 'asdfgh', 'asdfghjkl', '1q2w3e4r', '1qaz2wsx',
    'q1w2e3r4', 'zaq12wsx', '000000', '654321', '696969', '112233', '121212',
    'happy123', 'summer2024', 'winter2024', 'spring2024', 'autumn2024',
    'changeme', 'default', 'letmein1', 'password!', 'password2024',
    'password2025', 'password2026', 'welcome2026', 'temp1234', 'test1234',
  ].map((p) => p.toLowerCase()),
);

export function isDeniedPassword(candidate: string): boolean {
  return DENIED.has(candidate.toLowerCase());
}
