import { Command } from 'commander';
import { signTransaction } from '@clawrrency/core';
import { IdentityManager } from '@clawrrency/identity';
import { InMemoryLedger } from '@clawrrency/ledger';
import * as path from 'node:path';
import * as os from 'node:os';

const program = new Command();

const DATA_DIR = path.join(os.homedir(), '.clawrrency');
const IDENTITY_FILE = path.join(DATA_DIR, 'identities.json');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');

program
  .name('clawrrency')
  .description('CLI for clawrrency bot currency system')
  .version('0.1.0');

program
  .command('create-wallet')
  .description('Create a new bot wallet')
  .option('-n, --name <name>', 'Bot name')
  .option('-d, --description <description>', 'Bot description')
  .action(async (options) => {
    try {
      const manager = new IdentityManager(IDENTITY_FILE);
      await manager.initialize();

      const wallet = await manager.createWallet({
        name: options.name,
        description: options.description,
      });

      console.log(`✓ Wallet created successfully!`);
      console.log(`  Public Key: ${wallet.public_key}`);
      console.log(`  Name: ${options.name || 'Unnamed'}`);
    } catch (error) {
      console.error(`✗ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('list-wallets')
  .description('List all wallets')
  .action(async () => {
    try {
      const manager = new IdentityManager(IDENTITY_FILE);
      await manager.initialize();

      const identities = await manager.listIdentities();
      
      if (identities.length === 0) {
        console.log('No wallets found.');
        return;
      }

      console.log(`Found ${identities.length} wallet(s):\n`);
      
      for (const pubkey of identities) {
        const identity = await manager.getIdentity(pubkey);
        console.log(`  ${identity?.metadata?.name || 'Unnamed'}`);
        console.log(`    Public Key: ${pubkey.slice(0, 16)}...`);
        console.log(`    Reputation: ${identity?.reputation || 0}`);
        console.log();
      }
    } catch (error) {
      console.error(`✗ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('balance')
  .description('Check wallet balance')
  .requiredOption('-p, --public-key <key>', 'Public key')
  .action(async (options) => {
    try {
      const ledger = new InMemoryLedger(LEDGER_FILE);
      await ledger.initialize();

      const balance = await ledger.getBalance(options.publicKey);
      console.log(`Balance: ${balance} 🐚`);
    } catch (error) {
      console.error(`✗ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('transfer')
  .description('Transfer shells to another account')
  .requiredOption('-f, --from <key>', 'Sender public key')
  .requiredOption('-t, --to <key>', 'Recipient public key')
  .requiredOption('-a, --amount <amount>', 'Amount to transfer', parseInt)
  .action(async (options) => {
    try {
      const manager = new IdentityManager(IDENTITY_FILE);
      const ledger = new InMemoryLedger(LEDGER_FILE);
      
      await manager.initialize();
      await ledger.initialize();

      const wallet = await manager.loadWallet(options.from);
      if (!wallet) {
        console.error('✗ Sender wallet not found');
        process.exit(1);
      }

      const account = await ledger.getAccount(options.from);
      if (!account) {
        console.error('✗ Sender account not found in ledger');
        process.exit(1);
      }

      const recipient = await ledger.getAccount(options.to);
      if (!recipient) {
        console.error('✗ Recipient account not found');
        process.exit(1);
      }

      const tx = {
        version: 1 as const,
        type: 'transfer' as const,
        from: options.from,
        to: options.to,
        amount: options.amount,
        nonce: account.nonce + 1,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(tx);
      const result = await ledger.applyTransaction({ ...tx, signature });

      if (result.success) {
        console.log(`✓ Transfer successful!`);
        console.log(`  Amount: ${options.amount} 🐚`);
        console.log(`  To: ${options.to.slice(0, 16)}...`);
        console.log(`  Fee: 1 🐚`);
      } else {
        console.error(`✗ Transfer failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`✗ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('history')
  .description('View transaction history')
  .requiredOption('-p, --public-key <key>', 'Public key')
  .option('-l, --limit <limit>', 'Number of transactions', '10')
  .action(async (options) => {
    try {
      const ledger = new InMemoryLedger(LEDGER_FILE);
      await ledger.initialize();

      const history = await ledger.getTransactionHistory(options.publicKey, parseInt(options.limit));
      
      if (history.length === 0) {
        console.log('No transactions found.');
        return;
      }

      console.log(`Transaction History (${history.length}):\n`);
      
      for (const tx of history) {
        const direction = tx.from === options.publicKey ? 'OUT' : 'IN';
        const counterparty = tx.from === options.publicKey ? tx.to : tx.from;
        
        console.log(`  ${direction} ${tx.amount} 🐚`);
        console.log(`    Counterparty: ${counterparty?.slice(0, 16)}...`);
        console.log(`    Type: ${tx.type}`);
        console.log(`    Nonce: ${tx.nonce}`);
        console.log();
      }
    } catch (error) {
      console.error(`✗ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('register')
  .description('Register bot with stake')
  .requiredOption('-p, --public-key <key>', 'Public key')
  .requiredOption('-s, --stake <amount>', 'Stake amount', parseInt)
  .option('-a, --attestation <key>', 'Attester public key')
  .action(async (options) => {
    try {
      const manager = new IdentityManager(IDENTITY_FILE);
      await manager.initialize();

      const result = await manager.registerBot(
        options.publicKey,
        options.stake,
        options.attestation
      );

      if (result.success) {
        console.log(`✓ Bot registered successfully!`);
        console.log(`  Stake: ${options.stake} 🐚`);
        if (options.attestation) {
          console.log(`  Attested by: ${options.attestation.slice(0, 16)}...`);
        }
      } else {
        console.error(`✗ Registration failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`✗ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('reputation')
  .description('Check bot reputation')
  .requiredOption('-p, --public-key <key>', 'Public key')
  .action(async (options) => {
    try {
      const manager = new IdentityManager(IDENTITY_FILE);
      await manager.initialize();

      const reputation = await manager.getReputation(options.publicKey);
      const identity = await manager.getIdentity(options.publicKey);

      console.log(`Reputation: ${reputation}`);
      
      if (identity) {
        console.log(`Staked: ${identity.staked_amount} 🐚`);
        console.log(`Attestations: ${identity.attestations.length}`);
      }
    } catch (error) {
      console.error(`✗ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

export { program };
