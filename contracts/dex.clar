;; dex.clar
;; Simple DEX with bonding curve pricing - Generic Version

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-insufficient-balance (err u102))
(define-constant err-invalid-amount (err u103))
(define-constant err-slippage (err u104))
(define-constant err-not-initialized (err u105))

;; Data vars
(define-data-var reserve-stx uint u0)
(define-data-var reserve-token uint u0)
(define-data-var invariant uint u0)
(define-data-var fee-percent uint u30) ;; 0.3% fee
(define-data-var initialized bool false)

;; Token contract address (set during initialization)
(define-data-var token-contract principal tx-sender)

;; Public functions

;; Initialize DEX with a token
(define-public (initialize (token-contract-addr principal) (initial-stx uint) (initial-token uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (not (var-get initialized)) err-invalid-amount)
    (asserts! (> initial-stx u0) err-invalid-amount)
    (asserts! (> initial-token u0) err-invalid-amount)
    
    ;; Set initial reserves
    (var-set token-contract token-contract-addr)
    (var-set reserve-stx initial-stx)
    (var-set reserve-token initial-token)
    (var-set invariant (* initial-stx initial-token))
    (var-set initialized true)
    
    (print { event: "dex-initialized", token: token-contract-addr, stx: initial-stx, token-amount: initial-token })
    (ok true)
  )
)

;; Buy tokens with STX
(define-public (buy-tokens (stx-in uint) (min-tokens-out uint))
  (let (
      (reserve-stx-current (var-get reserve-stx))
      (reserve-token-current (var-get reserve-token))
      (invariant-current (var-get invariant))
      (fee (/ (* stx-in (var-get fee-percent)) u10000))
      (stx-after-fee (- stx-in fee))
    )
    (begin
      (asserts! (var-get initialized) err-not-initialized)
      (asserts! (> stx-in u0) err-invalid-amount)
      
      ;; Calculate tokens out using bonding curve: y = k / (x + dx)
      (let (
          (new-reserve-stx (+ reserve-stx-current stx-after-fee))
          (new-reserve-token (/ invariant-current new-reserve-stx))
          (tokens-out (- reserve-token-current new-reserve-token))
        )
        (begin
          ;; Check slippage
          (asserts! (>= tokens-out min-tokens-out) err-slippage)
          
          ;; Transfer STX from user to contract
          (try! (stx-transfer? stx-in tx-sender (as-contract tx-sender)))
          
          ;; Update reserves
          (var-set reserve-stx new-reserve-stx)
          (var-set reserve-token new-reserve-token)
          
          (print { event: "buy", buyer: tx-sender, stx-in: stx-in, tokens-out: tokens-out, fee: fee })
          (ok tokens-out)
        )
      )
    )
  )
)

;; Sell tokens for STX
(define-public (sell-tokens (token-in uint) (min-stx-out uint))
  (let (
      (reserve-stx-current (var-get reserve-stx))
      (reserve-token-current (var-get reserve-token))
      (invariant-current (var-get invariant))
    )
    (begin
      (asserts! (var-get initialized) err-not-initialized)
      (asserts! (> token-in u0) err-invalid-amount)
      
      ;; Calculate STX out using bonding curve
      (let (
          (new-reserve-token (+ reserve-token-current token-in))
          (new-reserve-stx (/ invariant-current new-reserve-token))
          (stx-out (- reserve-stx-current new-reserve-stx))
          (fee (/ (* stx-out (var-get fee-percent)) u10000))
          (stx-after-fee (- stx-out fee))
        )
        (begin
          ;; Check slippage
          (asserts! (>= stx-after-fee min-stx-out) err-slippage)
          
          ;; Update reserves
          (var-set reserve-stx new-reserve-stx)
          (var-set reserve-token new-reserve-token)
          
          (print { event: "sell", seller: tx-sender, tokens-in: token-in, stx-out: stx-after-fee, fee: fee })
          (ok stx-after-fee)
        )
      )
    )
  )
)

;; Add liquidity
(define-public (add-liquidity (stx-amount uint) (token-amount uint))
  (let (
      (reserve-stx-current (var-get reserve-stx))
      (reserve-token-current (var-get reserve-token))
    )
    (begin
      (asserts! (var-get initialized) err-not-initialized)
      (asserts! (> stx-amount u0) err-invalid-amount)
      (asserts! (> token-amount u0) err-invalid-amount)
      
      ;; Calculate required token amount based on current ratio
      (let ((required-tokens (/ (* stx-amount reserve-token-current) reserve-stx-current)))
        (asserts! (>= token-amount required-tokens) err-invalid-amount)
      )
      
      ;; Transfer STX from user to contract
      (try! (stx-transfer? stx-amount tx-sender (as-contract tx-sender)))
      
      ;; Update reserves
      (var-set reserve-stx (+ reserve-stx-current stx-amount))
      (var-set reserve-token (+ reserve-token-current token-amount))
      (var-set invariant (* (var-get reserve-stx) (var-get reserve-token)))
      
      (print { event: "liquidity-added", provider: tx-sender, stx: stx-amount, tokens: token-amount })
      (ok true)
    )
  )
)

;; Remove liquidity
(define-public (remove-liquidity (percent uint))
  (let (
      (reserve-stx-current (var-get reserve-stx))
      (reserve-token-current (var-get reserve-token))
    )
    (begin
      (asserts! (var-get initialized) err-not-initialized)
      (asserts! (<= percent u100) err-invalid-amount)
      (asserts! (> percent u0) err-invalid-amount)
      
      (let (
          (stx-out (/ (* reserve-stx-current percent) u100))
          (tokens-out (/ (* reserve-token-current percent) u100))
        )
        (begin
          ;; Transfer STX to user
          (try! (as-contract (stx-transfer? stx-out tx-sender tx-sender)))
          
          ;; Update reserves
          (var-set reserve-stx (- reserve-stx-current stx-out))
          (var-set reserve-token (- reserve-token-current tokens-out))
          (var-set invariant (* (var-get reserve-stx) (var-get reserve-token)))
          
          (print { event: "liquidity-removed", provider: tx-sender, stx: stx-out, tokens: tokens-out })
          (ok true)
        )
      )
    )
  )
)

;; Set fee (owner only)
(define-public (set-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (<= new-fee u1000) err-invalid-amount) ;; Max 10%
    (var-set fee-percent new-fee)
    (ok true)
  )
)

;; Read-only functions
(define-read-only (get-price)
  (let ((reserve-stx-current (var-get reserve-stx))
        (reserve-token-current (var-get reserve-token)))
    (if (> reserve-token-current u0)
        (/ (* reserve-stx-current u1000000) reserve-token-current)
        u0)
  )
)

(define-read-only (get-reserves)
  {
    stx: (var-get reserve-stx),
    tokens: (var-get reserve-token),
    invariant: (var-get invariant),
    fee: (var-get fee-percent),
    initialized: (var-get initialized)
  }
)

(define-read-only (get-token-contract)
  (var-get token-contract)
)

(define-read-only (is-initialized)
  (var-get initialized)
)