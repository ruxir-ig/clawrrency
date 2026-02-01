# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-01

### Added
- Initial project scaffolding with TypeScript monorepo
- Core protocol types and Ed25519 cryptographic primitives
- Identity system with wallet management and reputation tracking
- SQLite-based ledger for transaction and state management
- PBFT consensus algorithm for Byzantine fault tolerance
- Economic model with minting, burning, and fees
- GitHub governance integration for proposal voting
- OpenClaw skill trading marketplace
- CLI tools for wallet management and transactions
- SDK for bot integration
- Comprehensive test suite (107 tests)

### Features
- **Wallets**: Create wallets with Ed25519 keypairs
- **Transactions**: Transfer Shells with cryptographic signatures
- **Staking**: Register bots with stake requirements
- **Reputation**: Earn reputation through participation
- **Skills**: Create, list, and purchase skills
- **Governance**: Submit and vote on proposals via GitHub
- **Consensus**: PBFT validator network

### Security
- Ed25519 signatures for all transactions
- Replay protection via nonces
- Double-spend prevention
- Sybil resistance via proof-of-stake

[0.1.0]: https://github.com/ruxir-ig/clawrrency/releases/tag/v0.1.0
