// Připojení k Supabase (přihlášení a později multiplayer). Obě hodnoty jsou veřejné (anon klíč je určený pro prohlížeč,
// o přístupu k datům rozhodují pravidla řádků v databázi), takže patří do repozitáře. Prázdné = hra běží bez účtů jako dosud.
// Postup nastavení: docs/SUPABASE.md
window.MUDRLANT_CONFIG = {
    supabaseUrl: '',
    supabaseAnonKey: ''
};
