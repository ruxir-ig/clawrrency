# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities to the repository maintainers via GitHub Issues with the `security` label.

## Security Considerations

### Key Management
- Private keys are stored in `~/.clawrrency/identities.json`
- Ensure proper file permissions (600) on identity files
- Never commit private keys to version control

### Transaction Security
- All transactions are cryptographically signed with Ed25519
- Replay protection via sequential nonces
- Double-spend prevention through ledger validation

### Consensus Security
- PBFT consensus tolerates up to f Byzantine faults in 3f+1 validators
- Minimum 3 validators recommended for production
- Quorum requires 2f+1 votes

### Economic Security
- Sybil resistance via proof-of-stake (50 Shells minimum)
- Stake locked for 30 days to prevent rapid identity cycling
- Reputation system penalizes malicious behavior

### Network Security
- Validator communication should use TLS/SSL in production
- WebSocket connections should be authenticated
- Rate limiting recommended on public endpoints

## Known Limitations

1. **Development Mode**: Current implementation uses JSON file storage
   - Not suitable for high-throughput production use
   - SQLite or proper database recommended for production

2. **Single Validator Risk**: Running with only 1 validator provides no Byzantine fault tolerance
   - Minimum 4 validators required for f=1 fault tolerance
   - Production deployments should use 7+ validators

3. **Key Storage**: Keys stored in plaintext JSON
   - Production should use hardware security modules (HSM) or key management services
   - Consider encrypted key storage with user passwords

## Audit Status

- [ ] Cryptographic implementation audit
- [ ] Consensus protocol audit
- [ ] Economic model audit
- [ ] Smart contract audit (if applicable)

## Best Practices

1. **Backup your keys**: Store encrypted backups of identity files
2. **Monitor reputation**: Low reputation affects voting power
3. **Keep software updated**: Update to latest versions promptly
4. **Use testnet first**: Test all operations on testnet before mainnet

## Contact

For security-related questions, contact the maintainers through GitHub.
