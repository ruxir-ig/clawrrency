import { program } from 'commander';

program
  .name('clawrrency')
  .description('CLI for clawrrency bot currency system')
  .version('0.1.0');

program
  .command('register')
  .description('Register a new bot')
  .action(() => {
    console.log('Registering bot... (not implemented)');
  });

program
  .command('balance')
  .description('Check bot balance')
  .argument('<public_key>', 'Bot public key')
  .action((_public_key: string) => {
    console.log('Checking balance... (not implemented)');
  });

program
  .command('transfer')
  .description('Transfer shells to another bot')
  .argument('<to>', 'Recipient public key')
  .argument('<amount>', 'Amount to transfer')
  .action((_to: string, _amount: string) => {
    console.log('Transferring... (not implemented)');
  });

export { program };
