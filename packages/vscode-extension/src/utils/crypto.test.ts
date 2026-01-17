import { createPassphrase, encrypt, decrypt, computeHash, isLegacyFormat, isModernFormat } from './crypto';

describe('crypto utils', () => {
  it('round-trips encryption and decryption', () => {
    const passphrase = createPassphrase('test@example.com', 'device-123');
    const content = 'HELLO=world\nANOTHER=value';
    const encrypted = encrypt(content, passphrase);

    expect(isModernFormat(encrypted)).toBe(true);
    expect(isLegacyFormat(encrypted)).toBe(false);

    const decrypted = decrypt(encrypted, passphrase);
    expect(decrypted).toBe(content);
  });

  it('computes deterministic hash', () => {
    const content = 'HELLO=world';
    expect(computeHash(content)).toBe(computeHash(content));
  });
});
