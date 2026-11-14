// Připojení k Supabase (přihlášení a později multiplayer). Obě hodnoty jsou veřejné (publishable / anon klíč je určený pro prohlížeč,
// o přístupu k datům rozhodují pravidla řádků v databázi), takže patří do repozitáře. Prázdné = hra běží bez účtů jako dosud.
// Postup nastavení: docs/SUPABASE.md
window.MUDRLANT_CONFIG = {
    supabaseUrl: 'https://huddetwgroskdhozlkcf.supabase.co',
    supabaseAnonKey: 'sb_publishable_ydolJfZPZZcpOKU9sqIlIw_kE82qS7y',   // klíč „Publishable key“ (sb_publishable_…) nebo starý „anon“
    // Veřejný klíč VAPID pro upozornění (npx web-push generate-vapid-keys, viz docs/SUPABASE.md). Je veřejný; soukromý patří jen do GitHub secrets. Prázdný = upozornění vypnutá.
    vapidPublicKey: 'BOsOLUS_Df4mPMUHeLdPdDNVJH_ttdS2dLh7PslUdbaWnS0QgGZFGQIs2F88aWNT-ZGvDEgfwXN-d5_cYmbROpg'
};
