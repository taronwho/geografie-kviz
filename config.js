// Připojení k Supabase (přihlášení a později multiplayer). Obě hodnoty jsou veřejné (publishable / anon klíč je určený pro prohlížeč,
// o přístupu k datům rozhodují pravidla řádků v databázi), takže patří do repozitáře. Prázdné = hra běží bez účtů jako dosud.
// Postup nastavení: docs/SUPABASE.md
window.MUDRLANT_CONFIG = {
    supabaseUrl: 'https://huddetwgroskdhozlkcf.supabase.co',
    supabaseAnonKey: 'sb_publishable_ydolJfZPZZcpOKU9sqIlIw_kE82qS7y'   // klíč „Publishable key“ (sb_publishable_…) nebo starý „anon“
};
