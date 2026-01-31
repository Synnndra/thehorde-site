// MidEvils NFT Swap - Offer Detail Page

async function loadOfferDetails(offerId) {
    showLoading('Loading offer details...');

    try {
        const response = await fetch(`/api/swap/offer/${offerId}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        currentOffer = data.offer;
        hideLoading();
        displayOfferDetails();

    } catch (err) {
        console.error('Error loading offer:', err);
        showError('Failed to load offer: ' + err.message);
    }
}

function displayOfferDetails() {
    if (!currentOffer || !elements.offerDetails) return;

    elements.offerDetails.style.display = 'block';

    const statusBadge = elements.offerStatusBanner.querySelector('.status-badge');
    statusBadge.className = `status-badge ${currentOffer.status.toLowerCase()}`;
    statusBadge.textContent = currentOffer.status;

    if (currentOffer.status === 'pending' && currentOffer.expiresAt) {
        clearCountdowns();
        elements.expiresText.dataset.expires = currentOffer.expiresAt;
        startCountdown(elements.expiresText, currentOffer.expiresAt);
    } else if (currentOffer.status === 'accepted') {
        elements.expiresText.textContent = `Accepted on ${new Date(currentOffer.acceptedAt).toLocaleString()}`;
    } else if (currentOffer.status === 'cancelled') {
        elements.expiresText.textContent = `Cancelled on ${new Date(currentOffer.cancelledAt).toLocaleString()}`;
    } else {
        elements.expiresText.textContent = '';
    }

    const shortInitiator = currentOffer.initiator.wallet.slice(0, 4) + '...' + currentOffer.initiator.wallet.slice(-4);
    elements.initiatorWallet.textContent = shortInitiator;

    if (connectedWallet === currentOffer.initiator.wallet) {
        elements.initiatorLabel.textContent = 'You Offer';
    } else {
        elements.initiatorLabel.textContent = 'They Offer';
    }

    displayOfferItems(
        elements.initiatorItems,
        currentOffer.initiator.nftDetails || [],
        currentOffer.initiator.sol || 0
    );

    const shortReceiver = currentOffer.receiver.wallet.slice(0, 4) + '...' + currentOffer.receiver.wallet.slice(-4);
    elements.receiverWallet.textContent = shortReceiver;

    if (connectedWallet === currentOffer.receiver.wallet) {
        elements.receiverLabel.textContent = 'You Give';
    } else {
        elements.receiverLabel.textContent = 'In Exchange For';
    }

    displayOfferItems(
        elements.receiverItems,
        currentOffer.receiver.nftDetails || [],
        currentOffer.receiver.sol || 0
    );

    const feeNotice = document.getElementById('feeNotice');
    if (feeNotice) {
        applyFeeNotice(feeNotice, currentOffer.fee === 0 || currentOffer.isOrcHolder, currentOffer.fee);
    }

    displayOfferActions();
}

function displayOfferItems(container, nftDetails, solAmount) {
    if (!container) return;

    container.innerHTML = '';

    if (nftDetails.length === 0 && solAmount === 0) {
        container.innerHTML = '<div class="empty-state">Nothing</div>';
        return;
    }

    nftDetails.forEach(nft => {
        const item = document.createElement('div');
        item.className = 'offer-item';
        item.innerHTML = `
            <img class="skeleton" src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}"
                 onload="this.classList.remove('skeleton')"
                 onerror="this.classList.remove('skeleton')">
            <span class="item-name">${escapeHtml(nft.name)}</span>
        `;
        container.appendChild(item);
    });

    if (solAmount > 0) {
        const solItem = document.createElement('div');
        solItem.className = 'offer-item sol-item';
        solItem.textContent = `${solAmount} SOL`;
        container.appendChild(solItem);
    }
}

function displayOfferActions() {
    if (!elements.offerActions || !currentOffer) return;

    elements.offerActions.innerHTML = '';

    if (currentOffer.status === 'completed') {
        elements.offerActions.innerHTML = '<p class="success-notice">Trade completed successfully! Assets have been exchanged.</p>';
        return;
    }

    if (currentOffer.status === 'escrowed') {
        const hasError = currentOffer.releaseToReceiverError || currentOffer.releaseToInitiatorError;
        if (hasError) {
            const errorMsg = currentOffer.releaseToReceiverError || currentOffer.releaseToInitiatorError;
            elements.offerActions.innerHTML = `<p class="error-notice">Escrow release pending. Error: ${escapeHtml(errorMsg)}</p>
                <p>The release will be retried automatically, or you can <button class="retry-release-btn" data-offer-id="${escapeHtml(currentOffer.id)}">Retry Now</button></p>`;
            const retryBtn = elements.offerActions.querySelector('.retry-release-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => retryRelease(retryBtn.dataset.offerId));
            }
        } else {
            elements.offerActions.innerHTML = '<p class="success-notice">Both sides escrowed. Releases are being processed...</p>';
        }
        return;
    }

    if (currentOffer.status === 'failed') {
        elements.offerActions.innerHTML = '<p class="error-notice">This swap failed. Assets have been returned to their original owners.</p>';
        return;
    }

    if (currentOffer.status === 'accepted') {
        elements.offerActions.innerHTML = '<p class="success-notice">Trade accepted! Processing...</p>';
        return;
    }

    if (currentOffer.status !== 'pending') {
        elements.offerActions.innerHTML = '<p>This offer is no longer active.</p>';
        return;
    }

    const isInitiator = connectedWallet === currentOffer.initiator.wallet;
    const isReceiver = connectedWallet === currentOffer.receiver.wallet;

    if (isReceiver) {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'accept-btn';
        acceptBtn.textContent = 'Accept Trade';
        acceptBtn.addEventListener('click', () => showConfirmModal('accept'));

        const declineBtn = document.createElement('button');
        declineBtn.className = 'decline-btn';
        declineBtn.textContent = 'Decline';
        declineBtn.addEventListener('click', () => showConfirmModal('decline'));

        elements.offerActions.appendChild(acceptBtn);
        elements.offerActions.appendChild(declineBtn);
    } else if (isInitiator) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel Offer';
        cancelBtn.addEventListener('click', () => showConfirmModal('cancel'));

        elements.offerActions.appendChild(cancelBtn);
    } else {
        elements.offerActions.innerHTML = '<p>Connect your wallet to interact with this offer.</p>';
    }
}

function showConfirmModal(action) {
    const titles = {
        accept: 'Accept Trade',
        decline: 'Decline Offer',
        cancel: 'Cancel Offer'
    };

    const messages = {
        decline: 'Are you sure you want to decline this offer?',
        cancel: 'Are you sure you want to cancel this offer?'
    };

    elements.confirmModalTitle.textContent = titles[action];

    if (action === 'accept') {
        let summaryHtml = '<p>Are you sure you want to accept this trade?</p>';
        summaryHtml += '<div class="confirm-trade-summary">';
        summaryHtml += '<div class="confirm-side">';
        summaryHtml += '<strong>You give:</strong>';
        const receiverNfts = currentOffer.receiver.nftDetails || [];
        const receiverSol = currentOffer.receiver.sol || 0;
        if (receiverNfts.length === 0 && receiverSol === 0) {
            summaryHtml += '<span>Nothing</span>';
        } else {
            receiverNfts.forEach(n => { summaryHtml += `<span>${escapeHtml(n.name)}</span>`; });
            if (receiverSol > 0) summaryHtml += `<span>${receiverSol} SOL</span>`;
        }
        summaryHtml += '</div>';
        summaryHtml += '<div class="confirm-side">';
        summaryHtml += '<strong>You get:</strong>';
        const initiatorNfts = currentOffer.initiator.nftDetails || [];
        const initiatorSol = currentOffer.initiator.sol || 0;
        if (initiatorNfts.length === 0 && initiatorSol === 0) {
            summaryHtml += '<span>Nothing</span>';
        } else {
            initiatorNfts.forEach(n => { summaryHtml += `<span>${escapeHtml(n.name)}</span>`; });
            if (initiatorSol > 0) summaryHtml += `<span>${initiatorSol} SOL</span>`;
        }
        summaryHtml += '</div></div>';
        if (USE_BLOCKCHAIN) {
            summaryHtml += '<p class="confirm-warning">You will sign a transaction to send your assets to escrow. This cannot be undone.</p>';
        }
        elements.confirmModalMessage.innerHTML = summaryHtml;
    } else {
        elements.confirmModalMessage.textContent = messages[action];
    }

    elements.confirmActionBtn.onclick = () => executeOfferAction(action);

    elements.confirmModal.style.display = 'flex';
}

async function executeOfferAction(action) {
    elements.confirmModal.style.display = 'none';

    const isAccept = action === 'accept' && USE_BLOCKCHAIN;
    const acceptSteps = [
        'Check your wallet for an approval request',
        'Confirming escrow on-chain',
        'Check your wallet to sign a verification message',
        'Releasing escrowed assets',
        'Completing swap',
    ];

    if (isAccept) {
        showSteppedLoading(acceptSteps, 0);
    } else {
        showLoading(`Processing ${action}...`);
    }

    try {
        let endpoint, body;
        let blockchainResult = null;

        if (action === 'accept') {
            solBalance = await fetchSolBalance(connectedWallet);

            const receiverSol = parseFloat(currentOffer.receiver?.sol) || 0;
            const requiredSol = receiverSol + 0.005;
            if (solBalance < requiredSol) {
                showError(`Insufficient SOL balance. You need at least ${requiredSol.toFixed(4)} SOL (${receiverSol > 0 ? receiverSol + ' SOL to send + ' : ''}~0.005 tx fees). Your balance: ${solBalance.toFixed(4)} SOL`);
                return;
            }

            if (USE_BLOCKCHAIN) {
                showSteppedLoading(acceptSteps, 0);
                blockchainResult = await acceptOfferOnChain(currentOffer);

                if (!blockchainResult.success) {
                    throw new Error(blockchainResult.error || 'Blockchain transaction failed');
                }
                showSteppedLoading(acceptSteps, 1);
                await new Promise(r => setTimeout(r, 400));
                showSteppedLoading(acceptSteps, 2);
            }
        }

        if (isAccept) {
            showSteppedLoading(acceptSteps, 2);
        } else {
            showLoading('Please sign the message to verify wallet ownership...');
        }
        const timestamp = Date.now();
        const message = `Midswap ${action} offer ${currentOffer.id} at ${timestamp}`;
        let signature;
        try {
            signature = await signMessageForAuth(message);
        } catch (signErr) {
            throw new Error('Message signing cancelled or failed: ' + signErr.message);
        }

        if (action === 'accept') {
            endpoint = '/api/swap/accept';
            body = {
                offerId: currentOffer.id,
                wallet: connectedWallet,
                txSignature: blockchainResult?.signature || null,
                signature: signature,
                message: message
            };
        } else if (action === 'decline' || action === 'cancel') {
            endpoint = '/api/swap/cancel';
            body = {
                offerId: currentOffer.id,
                wallet: connectedWallet,
                action: action,
                signature: signature,
                message: message
            };
        }

        if (isAccept) {
            showSteppedLoading(acceptSteps, 3);
        } else {
            showLoading('Updating offer status...');
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        if (isAccept) {
            showSteppedLoading(acceptSteps, 4);
            await new Promise(r => setTimeout(r, 500));
        }

        hideLoading();

        let acceptMessage;
        if (action === 'accept' && USE_BLOCKCHAIN) {
            if (data.status === 'completed') {
                acceptMessage = `Trade completed successfully! NFTs have been exchanged on-chain.${blockchainResult?.signature ? '\n\nTx: ' + blockchainResult.signature.slice(0, 20) + '...' : ''}`;
            } else {
                acceptMessage = 'Your assets are escrowed. The server is releasing both sides — this usually takes 1–2 minutes. This page will refresh automatically.';
            }
        }

        const successMessages = {
            accept: acceptMessage || 'Trade completed successfully! The NFTs have been exchanged.',
            decline: 'Offer declined. The initiator has been notified.',
            cancel: 'Offer cancelled successfully.'
        };

        elements.resultModalTitle.textContent = data.status === 'completed' || action !== 'accept' ? 'Success!' : 'Processing...';
        elements.resultModalMessage.textContent = successMessages[action];
        elements.resultModal.style.display = 'flex';

        if (data.status !== 'completed') {
            setTimeout(() => loadOfferDetails(currentOffer.id), 10000);
        }

        loadOfferDetails(currentOffer.id);

    } catch (err) {
        console.error(`Error ${action}ing offer:`, err);
        showError(`Failed to ${action} offer: ` + err.message);
    }
}

async function executeAtomicSwap(offer) {
    const connection = getSolanaConnection();
    const provider = getWalletProvider();
    const signer = provider.publicKey;

    try {
        const receiverPubkey = new solanaWeb3.PublicKey(offer.receiver.wallet);
        const escrowPubkey = new solanaWeb3.PublicKey(ESCROW_WALLET);

        if (signer.toBase58() !== offer.receiver.wallet) {
            throw new Error('Only the receiver can accept this offer');
        }

        const transaction = new solanaWeb3.Transaction();

        const receiverNfts = offer.receiver.nftDetails || [];

        const swapAssetResults = await Promise.all(receiverNfts.map(nft => getAssetWithProof(nft.id)));
        const swapAssetMap = new Map(receiverNfts.map((nft, i) => [nft.id, swapAssetResults[i]]));

        for (const nft of receiverNfts) {
            const asset = swapAssetMap.get(nft.id);

            if (asset?.interface === 'MplCoreAsset') {
                const collection = asset.grouping?.find(g => g.group_key === 'collection')?.group_value;
                const ix = createMplCoreTransferInstruction(nft.id, receiverPubkey, escrowPubkey, collection);
                transaction.add(ix);
            } else if (asset?.compression?.compressed === true) {
                await transferCompressedNFT(nft.id, receiverPubkey, escrowPubkey, transaction);
            } else {
                const mint = new solanaWeb3.PublicKey(nft.id);

                const tokenAccounts = await getTokenAccountsForMint(receiverPubkey, mint);

                if (tokenAccounts.length === 0) {
                    throw new Error(`You don't own this NFT (${nft.name})`);
                }

                let sourceAta = null;
                for (const ta of tokenAccounts) {
                    const balance = ta.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
                    if (balance > 0) {
                        sourceAta = new solanaWeb3.PublicKey(ta.pubkey);
                        break;
                    }
                }

                if (!sourceAta) {
                    throw new Error(`No token account with balance found for ${nft.name}`);
                }

                const destAta = await getATA(mint, escrowPubkey);

                const destExists = await ataExists(destAta);
                if (!destExists) {
                    transaction.add(createATAInstruction(mint, escrowPubkey, signer));
                }

                transaction.add(createTokenTransferInstruction(sourceAta, destAta, signer, 1));
            }
        }

        if (offer.receiver.sol > 0) {
            const lamports = Math.floor(offer.receiver.sol * solanaWeb3.LAMPORTS_PER_SOL);
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: escrowPubkey,
                    lamports: lamports,
                })
            );
        }

        transaction.feePayer = signer;

        if (transaction.instructions.length === 0) {
            if (offer.fee > 0) {
                // Fee already added above
            } else {
                return { success: true, signature: null };
            }
        }

        showLoading('Check your wallet for an approval request...');
        const result = await signAndSubmitTransaction(transaction);

        if (result.success) {
            showLoading('Transaction submitted, confirming on-chain...');
        }

        return result;

    } catch (err) {
        console.error('Atomic swap failed:', err);
        throw err;
    }
}

async function acceptOfferOnChain(offer) {
    if (!USE_BLOCKCHAIN) {
        return { success: true, mode: 'database' };
    }

    try {
        showLoading('Building swap transaction...');
        const result = await executeAtomicSwap(offer);

        if (result.success) {
            return result;
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('Accept offer failed:', err);
        throw err;
    }
}

async function retryRelease(offerId) {
    if (!connectedWallet) {
        showError('Please connect your wallet first');
        return;
    }

    try {
        const retrySteps = ['Sign message to verify wallet', 'Retrying escrow release'];
        showSteppedLoading(retrySteps, 0);
        const timestamp = Date.now();
        const message = `Midswap retry-release offer ${offerId} at ${timestamp}`;
        const signature = await signMessageForAuth(message);

        showSteppedLoading(retrySteps, 1);
        const response = await fetch('/api/swap/retry-release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                offerId,
                wallet: connectedWallet,
                signature,
                message
            })
        });

        const data = await response.json();
        hideLoading();

        if (data.error) {
            showError('Retry failed: ' + data.error);
            return;
        }

        if (data.status === 'completed') {
            elements.resultModalTitle.textContent = 'Success!';
            elements.resultModalMessage.textContent = 'Swap completed! Both sides have been released.';
            elements.resultModal.style.display = 'flex';
        } else {
            showError('Release still pending. It will be retried automatically.');
        }

        loadOfferDetails(offerId);
    } catch (err) {
        hideLoading();
        showError('Retry failed: ' + err.message);
    }
}
