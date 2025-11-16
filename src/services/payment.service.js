/**
 * Payment Service (x402)
 * Handles payment preparation and settlement
 */

const { facilitator } = require('@coinbase/x402');
const { useFacilitator } = require('x402/verify');
const { processPriceToAtomicAmount, findMatchingPaymentRequirements } = require('x402/shared');
const { decodePayment } = require('x402/schemes');
const { createPaymentHeader: createX402PaymentHeader } = require('x402/schemes').exact.svm;
const { createKeyPairSignerFromBytes } = require('@solana/kit');
const { Keypair, Connection } = require('@solana/web3.js');
const bs58 = require('bs58');
const { config } = require('../config/env.config');

class PaymentService {
  constructor() {
    this.x402Enabled = config.x402.enabled;
    this.x402PayToAddress = config.x402.receivingAddress;
    this.x402Network = config.x402.network;
    this.x402PriceUsd = config.x402.priceUsd;
    this.facilitatorUrl = config.x402.facilitatorUrl;
    this.cdpApiKeyId = config.x402.cdpApiKeyId;
    this.cdpApiKeySecret = config.x402.cdpApiKeySecret;
    this.solanaConnection = new Connection(config.solana.rpcUrl, 'confirmed');
    
    // Initialize facilitator client with CDP credentials
    const facilitatorConfig = this.x402Network === 'solana' ? facilitator : {
      url: this.facilitatorUrl
    };

    // Add CDP API credentials if available
    if (this.cdpApiKeyId && this.cdpApiKeySecret) {
      facilitatorConfig.headers = {
        'X-CDP-API-KEY-ID': this.cdpApiKeyId,
        'X-CDP-API-KEY-SECRET': this.cdpApiKeySecret
      };
      console.log('[Payment Service] CDP credentials configured');
    } else {
      console.warn('[Payment Service] CDP credentials not set - facilitator may require authentication');
    }
    
    this.facilitatorClient = useFacilitator(facilitatorConfig);
    
    this.supportedNetworks = new Set(['solana', 'solana-devnet']);
    this.supportedKindsCache = {
      fetchedAt: 0,
      data: null
    };

    if (!this.x402PayToAddress) {
      console.warn('⚠️  X402_SOLANA_RECEIVING_ADDRESS not set. Payments will be disabled.');
    }

    console.log('[Payment Service] Initialized with facilitator:', facilitator);
    console.log('[Payment Service] Network:', this.x402Network);
    console.log('[Payment Service] Pay to:', this.x402PayToAddress?.substring(0, 8) + '...');
  }

  isEnabled() {
    return this.x402Enabled && !!this.x402PayToAddress;
  }

  async getSupportedKinds() {
    try {
      const now = Date.now();
      if (!this.supportedKindsCache.data || now - this.supportedKindsCache.fetchedAt > 60_000) {
        console.log('[Payment Service] Fetching supported payment kinds from facilitator...');
        const kinds = await this.facilitatorClient.supported();
        console.log('[Payment Service] Supported kinds:', JSON.stringify(kinds, null, 2));
        this.supportedKindsCache = {
          fetchedAt: now,
          data: kinds
        };
      }
      return this.supportedKindsCache.data;
    } catch (error) {
      console.error('[Payment Service] Failed to get supported kinds:', error);
      throw new Error(`Failed to get supported payment kinds: ${error.message}`);
    }
  }

  async preparePayment() {
    if (!this.isEnabled()) {
      throw new Error('x402 payments are currently disabled.');
    }

    const targetNetwork = 'solana';
    const priceConversion = processPriceToAtomicAmount(0.06, targetNetwork);
    
    if (priceConversion.error) {
      throw new Error(priceConversion.error);
    }

    const requirements = {
      scheme: 'exact',
      network: targetNetwork,
      maxAmountRequired: priceConversion.maxAmountRequired,
      resource: 'https://agent.bylana-ai.com/api/agent/generate-x402',
      description: 'Create an AI image generation job',
      mimeType: 'application/json',
      payTo: this.x402PayToAddress,
      maxTimeoutSeconds: 120,
      asset: priceConversion.asset.address,
      extra: undefined
    };

    // Add fee payer for Solana networks
    if (this.supportedNetworks.has(targetNetwork)) {
      const supportedKinds = await this.getSupportedKinds();
      const exactKind = supportedKinds?.kinds?.find(
        (kind) => kind.network === targetNetwork && kind.scheme === 'exact'
      );
      const feePayer = exactKind?.extra?.feePayer;
      
      if (!feePayer) {
        throw new Error(`Facilitator did not provide a fee payer for ${targetNetwork}.`);
      }
      
      requirements.extra = { feePayer };
    } else if (priceConversion.asset?.eip712) {
      requirements.extra = priceConversion.asset.eip712;
    }

    return [requirements];
  }

  async settlePayment(paymentHeader) {
    if (!this.isEnabled()) {
      throw new Error('x402 payments are currently disabled.');
    }

    if (!paymentHeader) {
      throw new Error('paymentHeader is required for settlement');
    }

    const decodedPayment = decodePayment(paymentHeader);
    const requirements = await this.preparePayment();
    
    const selectedRequirement = findMatchingPaymentRequirements(
      requirements,
      decodedPayment
    );

    if (!selectedRequirement) {
      throw new Error('Provided payment does not match the required configuration.');
    }

    // Verify payment
    const verification = await this.facilitatorClient.verify(
      decodedPayment,
      selectedRequirement
    );
    
    if (!verification?.isValid) {
      throw new Error(
        verification?.invalidReason || 'Payment verification failed. Please retry.'
      );
    }

    // Settle payment
    const settlement = await this.facilitatorClient.settle(
      decodedPayment,
      selectedRequirement
    );
    
    if (!settlement?.success) {
      console.log('failed settlement:', settlement);
      throw new Error(
        settlement?.errorReason || 'Unable to settle payment. Please try again.'
      );
    }

    return {
      success: true,
      step: 'settle',
      settlement: {
        transaction: settlement.transaction,
        network: settlement.network || decodedPayment.network,
        payer: settlement.payer || verification?.payer || null,
        raw: settlement
      }
    };
  }

  async verifyPayment(paymentHeader) {
    if (!this.isEnabled()) {
      throw new Error('x402 payments are currently disabled.');
    }

    if (!paymentHeader) {
      throw new Error('paymentHeader is required for settlement');
    }

    const decodedPayment = decodePayment(paymentHeader);
    const requirements = await this.preparePayment();
    
    const selectedRequirement = findMatchingPaymentRequirements(
      requirements,
      decodedPayment
    );

    if (!selectedRequirement) {
      throw new Error('Provided payment does not match the required configuration.');
    }

    // Verify payment
    const verification = await this.facilitatorClient.verify(
      decodedPayment,
      selectedRequirement
    );
    
    if (!verification?.isValid) {
      throw new Error(
        verification?.invalidReason || 'Payment verification failed. Please retry.'
      );
    }

    return {
      success: true,
      step: 'verify',
      verification: verification
    };
  }

  async settleOnlyPayment(paymentHeader) {
    if (!this.isEnabled()) {
      throw new Error('x402 payments are currently disabled.');
    }

    if (!paymentHeader) {
      throw new Error('paymentHeader is required for settlement');
    }

    const decodedPayment = decodePayment(paymentHeader);
    const requirements = await this.preparePayment();
    
    const selectedRequirement = findMatchingPaymentRequirements(
      requirements,
      decodedPayment
    );

    if (!selectedRequirement) {
      console.log('provided payment does not match the required configuration:', decodedPayment);
      throw new Error('Provided payment does not match the required configuration.');
    }

    try {
      // Settle payment
      const settlement = await this.facilitatorClient.settle(
        decodedPayment,
        selectedRequirement
      );
  
      if (!settlement?.success) {
        console.log('[Payment Service] failed settlement:', {
          settlement,
          decodedPayment,
          selectedRequirement
        });
        throw new Error(
          settlement?.errorReason || 'Unable to settle payment. Please try again.'
        );
      }
  
      return {
        success: true,
        step: 'settle',
        settlement: {
          transaction: settlement.transaction,
          network: settlement.network || decodedPayment.network,
          payer: settlement.payer || null,
          raw: settlement
        }
      };
    } catch (error) {
      console.log('[Payment Service] Error during facilitatorClient.settle:', {
        message: error.message,
        stack: error.stack,
        decodedPayment,
        selectedRequirement
      });
      // Re-throw so the caller still sees the failure
      throw error;
    }
  }

  /**
   * Auto-sign payment using wallet private key
   * Uses x402's createPaymentHeader to create and sign payment transaction
   */
  async signPayment(requirements, walletPrivateKey, walletAddress) {
    try {
      if (!requirements || !requirements[0]) {
        throw new Error('Payment requirements are required');
      }
      
      const requirement = requirements[0];
      
      if (requirement.network !== 'solana' && requirement.network !== 'solana-devnet') {
        throw new Error(`Auto-signing only supported for Solana networks, got: ${requirement.network}`);
      }

      // Decode wallet private key (64-byte secret key: 32-byte private + 32-byte public)
      const decodedSecretKey = bs58.default.decode(walletPrivateKey);
      
      // Verify the secret key is 64 bytes
      if (decodedSecretKey.length !== 64) {
        throw new Error(`Invalid secret key length: expected 64 bytes, got ${decodedSecretKey.length}`);
      }
      
      // Verify wallet address matches by creating a keypair temporarily
      const walletKeypair = Keypair.fromSecretKey(decodedSecretKey);
      if (walletKeypair.publicKey.toString() !== walletAddress) {
        throw new Error('Wallet address does not match private key');
      }

      console.log('[Payment Service] Creating and signing payment using x402...');
      console.log('[Payment Service] Payment amount:', requirement.maxAmountRequired);
      console.log('[Payment Service] Asset:', requirement.asset);
      console.log('[Payment Service] Pay to:', requirement.payTo);

      // Create TransactionSigner from secret key bytes using @solana/kit
      // decodedSecretKey is a 64-byte Uint8Array (private key + public key)
      const signer = await createKeyPairSignerFromBytes(decodedSecretKey);

      // Use x402's createPaymentHeader to create and sign the payment
      // This handles all the complexity of creating the proper x402 payment format
      const x402Config = {
        rpcUrl: config.solana.rpcUrl
      };
      
      const paymentHeader = await createX402PaymentHeader(
        signer,
        1, // x402 version
        requirement,
        x402Config
      );
      
      console.log('[Payment Service] Payment signed successfully using x402');
      console.log('[Payment Service] Payment header created');

      return paymentHeader;
    } catch (error) {
      console.error('[Payment Service] Failed to sign payment:', error);
      throw new Error(`Payment signing failed: ${error.message}`);
    }
  }
}

module.exports = new PaymentService();

