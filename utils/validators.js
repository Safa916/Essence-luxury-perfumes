// utils/validators.js

/**
 * Valid full name: letters (any case), single spaces/hyphens/apostrophes
 * between words, at least 2 letters total. Rejects "----", "1234", "   ", etc.
 */
function isValidName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  const nameRegex = /^[A-Za-z]+([ '-][A-Za-z]+)*$/;
  return trimmed.length >= 2 && nameRegex.test(trimmed);
}

/**
 * Valid password: at least 8 characters, at least one letter and one number.
 * Adjust the regex if you want to also require a special character.
 */
function isValidPassword(password) {
  if (typeof password !== 'string') return false;
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
  return passwordRegex.test(password);
}

module.exports = { isValidName, isValidPassword };

/**
 * Detects likely typos in common email domains (gmail.com, yahoo.com, etc.)
 * using edit distance. Returns a suggested correction if the typed domain
 * is close-but-not-exact to a known provider, or null if no suggestion applies.
 *
 * Example: "safa@gmsil.com" -> suggests "safa@gmail.com"
 */
const KNOWN_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'aol.com',
  'protonmail.com',
];

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

function suggestEmailCorrection(email) {
  if (typeof email !== 'string' || !email.includes('@')) return null;

  const [localPart, domain] = email.trim().toLowerCase().split('@');
  if (!domain) return null;

  // Exact match — nothing to suggest
  if (KNOWN_DOMAINS.includes(domain)) return null;

  for (const knownDomain of KNOWN_DOMAINS) {
    const distance = levenshtein(domain, knownDomain);
    // Distance of 1-2 characters = likely typo (e.g. "gmsil.com" vs "gmail.com" = 1)
    // Distance 0 already excluded above; anything beyond 2 is probably a
    // genuinely different, valid domain — don't second-guess those.
    if (distance > 0 && distance <= 2) {
      return `${localPart}@${knownDomain}`;
    }
  }

  return null;
}

module.exports.suggestEmailCorrection = suggestEmailCorrection;