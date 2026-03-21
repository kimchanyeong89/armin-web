async function run() {
  const { exhibitions } = await import('./src/data/exhibitions.js');
  const missingSlug = exhibitions.filter(e => !e.slug);
  console.log('Missing slug:', missingSlug.map(e => e.id));
}
run();
