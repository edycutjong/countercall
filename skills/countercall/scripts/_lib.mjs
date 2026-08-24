// Shared helpers. No side effects, no network, no dialling.

export const E164 = /^\+[1-9]\d{7,14}$/;

/** A number is usable only if it is E.164 AND carries a published source. */
export function validateOffice(office) {
  const problems = [];
  if (!office) return ['office not found in the seed file'];
  if (!office.phone_e164) problems.push('no phone_e164');
  else if (!E164.test(office.phone_e164)) problems.push(`not E.164: ${office.phone_e164}`);
  if (!office.source_url) problems.push('no source_url — a number needs a published source');
  if (!office.source_checked) problems.push('no source_checked date');
  if (String(office.phone_e164 ?? '').includes('X')) problems.push('placeholder number');
  return problems;
}

/** Compare a pinned contract against the live published_run_spec. Any drift refuses the dial. */
export function diffContract(pinned, published) {
  const drift = [];
  if (!published) return ['no published_run_spec on the live Goal'];
  if (pinned.version !== published.version)
    drift.push(`version ${pinned.version} -> ${published.version}`);
  const live = Object.keys(published.result_schema?.properties ?? {});
  for (const field of pinned.result_fields) {
    if (!live.includes(field)) drift.push(`removed field: ${field}`);
  }
  for (const field of live) {
    if (!pinned.result_fields.includes(field)) drift.push(`new field: ${field}`);
  }
  if (published.result_schema?.additionalProperties !== false)
    drift.push('additionalProperties is no longer false');
  return drift;
}

/** Business-stable key: one office, one procedure, one day. */
export function idempotencyKey(officeId, procedure, date) {
  const slug = procedure.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `countercall:${officeId}:${slug}:${date}:v1`;
}

export function parseArgs(argv) {
  const args = { live: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') args.live = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
  }
  return args;
}
