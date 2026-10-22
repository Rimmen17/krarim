// Connection to the Supabase project (Project Settings, API).
// The publishable key is meant to be public: access is enforced by the row level
// security rules in supabase/schema.sql, not by keeping this file secret.
// While supabaseUrl is empty the site runs in demo mode on local browser storage.
export const config = {
  supabaseUrl: 'https://rdabjsryzearizqbafpu.supabase.co',
  supabaseAnonKey: 'sb_publishable_WUhWksp7U4qkCj6kh3yZUg_B6AED-Ee',
  // Logins are by name. Supabase needs an email, so "Sisse" signs in as sisse@<loginDomain>.
  // The accounts are created with this domain: changing it later locks both out.
  loginDomain: 'krarim.example',
};
