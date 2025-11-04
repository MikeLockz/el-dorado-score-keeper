package entities

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"time"
)

// CryptographicKeyPair represents locally-generated public/private key pair for player identity and action signing
type CryptographicKeyPair struct {
	ID           UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	PlayerID     UUID      `json:"playerId" db:"player_id" gorm:"not null;uniqueIndex;type:uuid"`
	KeyType      string    `json:"keyType" db:"key_type" gorm:"not null;default:'RSA';size:50"`
	KeySize      int       `json:"keySize" db:"key_size" gorm:"not null;default:2048"`
	PublicKey    string    `json:"publicKey" db:"public_key" gorm:"not null;type:text"` // PEM format
	PrivateKey   string    `json:"privateKey" db:"private_key" gorm:"not null;type:text"` // Encrypted PEM format
	KeyAlgorithm string    `json:"keyAlgorithm" db:"key_algorithm" gorm:"not null;default:'RSA-OAEP-SHA256';size:100"`

	// Security metadata
	KeyVersion   int       `json:"keyVersion" db:"key_version" gorm:"not null;default:1"`
	IsActive     bool      `json:"isActive" db:"is_active" gorm:"default:true"`
	IsRevoked    bool      `json:"isRevoked" db:"is_revoked" gorm:"default:false"`
	ExpiresAt    *time.Time `json:"expiresAt" db:"expires_at" gorm:"index"`
	RevokedAt    *time.Time `json:"revokedAt" db:"revoked_at" gorm:"index"`
	RevokedReason *string  `json:"revokedReason" db:"revoked_reason" gorm:"size:255"`

	// Usage tracking
	LastUsedAt   *time.Time `json:"lastUsedAt" db:"last_used_at" gorm:"index"`
	UsageCount   int64     `json:"usageCount" db:"usage_count" gorm:"default:0"`
	MaxUsageCount *int64   `json:"maxUsageCount" db:"max_usage_count"` // Optional usage limit

	// Timestamps
	CreatedAt    time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt    time.Time `json:"updatedAt" db:"updated_at" gorm:"autoCreateTime"`

	// Associations
	Player       PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
	KeyBackup    []KeyBackup   `json:"keyBackups,omitempty" gorm:"foreignKey:KeyPairID"`
}

// TableName returns the table name for CryptographicKeyPair
func (CryptographicKeyPair) TableName() string {
	return "cryptographic_key_pairs"
}

// Validate validates the cryptographic key pair
func (ckp *CryptographicKeyPair) Validate() error {
	if ckp.PublicKey == "" {
		return fmt.Errorf("public key is required")
	}
	if ckp.PrivateKey == "" {
		return fmt.Errorf("private key is required")
	}
	if ckp.KeySize < 2048 {
		return fmt.Errorf("key size must be at least 2048 bits")
	}
	if ckp.MaxUsageCount != nil && *ckp.MaxUsageCount < 0 {
		return fmt.Errorf("max usage count cannot be negative")
	}
	return nil
}

// IsExpired returns whether the key pair has expired
func (ckp *CryptographicKeyPair) IsExpired() bool {
	if ckp.ExpiresAt == nil {
		return false
	}
	return time.Now().After(*ckp.ExpiresAt)
}

// IsUsable returns whether the key pair can be used
func (ckp *CryptographicKeyPair) IsUsable() bool {
	return ckp.IsActive && !ckp.IsRevoked && !ckp.IsExpired()
}

// CanBeUsed returns whether the key pair can be used (checking usage limits)
func (ckp *CryptographicKeyPair) CanBeUsed() bool {
	if !ckp.IsUsable() {
		return false
	}
	if ckp.MaxUsageCount != nil && ckp.UsageCount >= *ckp.MaxUsageCount {
		return false
	}
	return true
}

// RecordUsage records that the key pair was used
func (ckp *CryptographicKeyPair) RecordUsage() {
	now := time.Now()
	ckp.LastUsedAt = &now
	ckp.UsageCount++
}

// Revoke revokes the key pair
func (ckp *CryptographicKeyPair) Revoke(reason string) {
	now := time.Now()
	ckp.IsRevoked = true
	ckp.RevokedAt = &now
	ckp.RevokedReason = &reason
}

// GenerateRSAKeyPair generates a new RSA key pair
func GenerateRSAKeyPair(keySize int) (*CryptographicKeyPair, error) {
	privateKey, err := rsa.GenerateKey(rand.Reader, keySize)
	if err != nil {
		return nil, fmt.Errorf("failed to generate RSA key pair: %w", err)
	}

	// Encode private key to PEM
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	})

	// Encode public key to PEM
	publicKeyBytes, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal public key: %w", err)
	}

	publicKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyBytes,
	})

	return &CryptographicKeyPair{
		PublicKey:  string(publicKeyPEM),
		PrivateKey: string(privateKeyPEM),
		KeyType:    "RSA",
		KeySize:    keySize,
		IsActive:   true,
	}, nil
}

// AuthenticationToken represents secure credential used to verify player identity and authorize actions
type AuthenticationToken struct {
	ID           UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	PlayerID     UUID      `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`
	TokenHash    string    `json:"tokenHash" db:"token_hash" gorm:"not null;size:128;uniqueIndex"` // SHA-256 hash
	TokenType    string    `json:"tokenType" db:"token_type" gorm:"not null;size:50"` // access, refresh, session
	Claims       JSONB     `json:"claims" db:"claims" gorm:"type:jsonb"`

	// Token lifecycle
	IsRevoked    bool      `json:"isRevoked" db:"is_revoked" gorm:"default:false;index"`
	RevokedAt    *time.Time `json:"revokedAt" db:"revoked_at" gorm:"index"`
	RevokedReason *string  `json:"revokedReason" db:"revoked_reason" gorm:"size:255"`
	ExpiresAt    time.Time `json:"expiresAt" db:"expires_at" gorm:"not null;index"`
	LastUsedAt   *time.Time `json:"lastUsedAt" db:"last_used_at" gorm:"index"`
	UsageCount   int64     `json:"usageCount" db:"usage_count" gorm:"default:0"`

	// Device and session information
	DeviceID     *string   `json:"deviceId" db:"device_id" gorm:"size:255;index"`
	UserAgent    *string   `json:"userAgent" db:"user_agent" gorm:"size:500"`
	IPAddress    *string   `json:"ipAddress" db:"ip_address" gorm:"size:45"` // IPv6 compatible
	SessionID    *string   `json:"sessionId" db:"session_id" gorm:"size:255;index"`

	// Security features
	RequiresMFA  bool      `json:"requiresMFA" db:"requires_mfa" gorm:"default:false"`
	MFAVerified  bool      `json:"mfaVerified" db:"mfa_verified" gorm:"default:false"`
	MaxUsageCount *int64   `json:"maxUsageCount" db:"max_usage_count"`

	// Timestamps
	CreatedAt    time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt    time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`

	// Associations
	Player       PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
}

// TableName returns the table name for AuthenticationToken
func (AuthenticationToken) TableName() string {
	return "authentication_tokens"
}

// Validate validates the authentication token
func (at *AuthenticationToken) Validate() error {
	if at.TokenHash == "" {
		return fmt.Errorf("token hash is required")
	}
	if at.TokenType == "" {
		return fmt.Errorf("token type is required")
	}
	if at.ExpiresAt.IsZero() {
		return fmt.Errorf("expiration time is required")
	}
	if at.MaxUsageCount != nil && *at.MaxUsageCount < 0 {
		return fmt.Errorf("max usage count cannot be negative")
	}
	return nil
}

// IsExpired returns whether the token has expired
func (at *AuthenticationToken) IsExpired() bool {
	return time.Now().After(at.ExpiresAt)
}

// IsRevoked returns whether the token has been revoked
func (at *AuthenticationToken) IsRevoked() bool {
	return at.IsRevoked
}

// IsValid returns whether the token is currently valid
func (at *AuthenticationToken) IsValid() bool {
	return !at.IsRevoked && !at.IsExpired()
}

// CanBeUsed returns whether the token can be used (checking usage limits and MFA)
func (at *AuthenticationToken) CanBeUsed() bool {
	if !at.IsValid() {
		return false
	}
	if at.RequiresMFA && !at.MFAVerified {
		return false
	}
	if at.MaxUsageCount != nil && at.UsageCount >= *at.MaxUsageCount {
		return false
	}
	return true
}

// RecordUsage records that the token was used
func (at *AuthenticationToken) RecordUsage() {
	now := time.Now()
	at.LastUsedAt = &now
	at.UsageCount++
}

// Revoke revokes the authentication token
func (at *AuthenticationToken) Revoke(reason string) {
	now := time.Now()
	at.IsRevoked = true
	at.RevokedAt = &now
	at.RevokedReason = &reason
}

// GetClaim extracts a claim value from the claims JSON
func (at *AuthenticationToken) GetClaim(key string) (interface{}, error) {
	var claims map[string]interface{}
	if err := json.Unmarshal(at.Claims, &claims); err != nil {
		return nil, fmt.Errorf("failed to unmarshal claims: %w", err)
	}
	return claims[key], nil
}

// SetClaim sets a claim value in the claims JSON
func (at *AuthenticationToken) SetClaim(key string, value interface{}) error {
	var claims map[string]interface{}
	if len(at.Claims) > 0 {
		if err := json.Unmarshal(at.Claims, &claims); err != nil {
			return fmt.Errorf("failed to unmarshal claims: %w", err)
		}
	} else {
		claims = make(map[string]interface{})
	}

	claims[key] = value
	data, err := json.Marshal(claims)
	if err != nil {
		return fmt.Errorf("failed to marshal claims: %w", err)
	}
	at.Claims = JSONB(data)
	return nil
}

// KeyBackup represents secure backup mechanism for cryptographic key recovery across devices
type KeyBackup struct {
	ID           UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	PlayerID     UUID      `json:"playerId" db:"player_id" gorm:"not null;index;type:uuid"`
	KeyPairID    UUID      `json:"keyPairId" db:"key_pair_id" gorm:"not null;index;type:uuid"`
	BackupType   string    `json:"backupType" db:"backup_type" gorm:"not null;size:50"` // encrypted, recovery_phrase, qr_code
	BackupData   string    `json:"backupData" db:"backup_data" gorm:"not null;type:text"` // Encrypted backup data

	// Security and verification
	EncryptionMethod string    `json:"encryptionMethod" db:"encryption_method" gorm:"not null;size:100"` // AES-256-GCM, etc.
	EncryptionKeyID  *string   `json:"encryptionKeyId" db:"encryption_key_id" gorm:"size:255"` // KMS key identifier
	VerificationHash string    `json:"verificationHash" db:"verification_hash" gorm:"not null;size:128"` // SHA-256
	Checksum         string    `json:"checksum" db:"checksum" gorm:"not null;size:128"` // Integrity verification

	// Backup lifecycle
	IsActive     bool      `json:"isActive" db:"is_active" gorm:"default:true"`
	IsUsed       bool      `json:"isUsed" db:"is_used" gorm:"default:false"`
	UsedAt       *time.Time `json:"usedAt" db:"used_at" gorm:"index"`
	ExpiresAt    *time.Time `json:"expiresAt" db:"expires_at" gorm:"index"`
	LastVerifiedAt *time.Time `json:"lastVerifiedAt" db:"last_verified_at" gorm:"index"`

	// Access control
	RequiresPassword  bool   `json:"requiresPassword" db:"requires_password" gorm:"default:true"`
	PasswordHint      *string `json:"passwordHint" db:"password_hint" gorm:"size:255"`
	MaxRestoreAttempts int  `json:"maxRestoreAttempts" db:"max_restore_attempts" gorm:"default:3"`
	RestoreAttempts    int  `json:"restoreAttempts" db:"restore_attempts" gorm:"default:0"`

	// Device and location tracking
	DeviceID         *string `json:"deviceId" db:"device_id" gorm:"size:255;index"`
	DeviceName       *string `json:"deviceName" db:"device_name" gorm:"size:255"`
	LocationHint     *string `json:"locationHint" db:"location_hint" gorm:"size:500"`

	// Timestamps
	CreatedAt        time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        time.Time `json:"updatedAt" db:"updated_at" gorm:"autoUpdateTime"`
	ArchivedAt       *time.Time `json:"archivedAt" db:"archived_at" gorm:"index"`

	// Associations
	Player           PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
	KeyPair          CryptographicKeyPair `json:"keyPair,omitempty" gorm:"foreignKey:KeyPairID"`
}

// TableName returns the table name for KeyBackup
func (KeyBackup) TableName() string {
	return "key_backups"
}

// Validate validates the key backup
func (kb *KeyBackup) Validate() error {
	if kb.BackupData == "" {
		return fmt.Errorf("backup data is required")
	}
	if kb.EncryptionMethod == "" {
		return fmt.Errorf("encryption method is required")
	}
	if kb.VerificationHash == "" {
		return fmt.Errorf("verification hash is required")
	}
	if kb.Checksum == "" {
		return fmt.Errorf("checksum is required")
	}
	if kb.MaxRestoreAttempts < 1 {
		return fmt.Errorf("max restore attempts must be at least 1")
	}
	if kb.RestoreAttempts < 0 {
		return fmt.Errorf("restore attempts cannot be negative")
	}
	return nil
}

// IsExpired returns whether the backup has expired
func (kb *KeyBackup) IsExpired() bool {
	if kb.ExpiresAt == nil {
		return false
	}
	return time.Now().After(*kb.ExpiresAt)
}

// IsUsable returns whether the backup can be used
func (kb *KeyBackup) IsUsable() bool {
	return kb.IsActive && !kb.IsUsed && !kb.IsExpired() && kb.RestoreAttempts < kb.MaxRestoreAttempts
}

// CanAttemptRestore returns whether a restore attempt can be made
func (kb *KeyBackup) CanAttemptRestore() bool {
	return kb.IsUsable() && kb.RestoreAttempts < kb.MaxRestoreAttempts
}

// RecordRestoreAttempt records a restore attempt
func (kb *KeyBackup) RecordRestoreAttempt() {
	kb.RestoreAttempts++
}

// MarkUsed marks the backup as used
func (kb *KeyBackup) MarkUsed() {
	now := time.Now()
	kb.IsUsed = true
	kb.UsedAt = &now
}

// Revoke revokes the backup
func (kb *KeyBackup) Revoke() {
	kb.IsActive = false
	now := time.Now()
	kb.ArchivedAt = &now
}

// VerifyBackup verifies the backup integrity using the verification hash
func (kb *KeyBackup) VerifyBackup() (bool, error) {
	// This would implement the actual verification logic
	// For now, return true as a placeholder
	return true, nil
}

// GenerateVerificationHash generates a verification hash for the backup data
func GenerateVerificationHash(backupData string) (string, error) {
	// This would implement SHA-256 hashing
	// For now, return a placeholder hash
	return "verification_hash_placeholder", nil
}

// GenerateChecksum generates a checksum for integrity verification
func GenerateChecksum(backupData string) (string, error) {
	// This would implement checksum calculation
	// For now, return a placeholder checksum
	return "checksum_placeholder", nil
}

// RecoveryPhrase represents a mnemonic phrase for key recovery (alternative to encrypted backup)
type RecoveryPhrase struct {
	ID           UUID      `json:"id" db:"id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	PlayerID     UUID      `json:"playerId" db:"player_id" gorm:"not null;uniqueIndex;type:uuid"`
	PhraseHash   string    `json:"phraseHash" db:"phrase_hash" gorm:"not null;size:128;uniqueIndex"` // Hash of the phrase
	WordCount    int       `json:"wordCount" db:"word_count" gorm:"not null;default:12"` // 12, 18, or 24 words
	Version      string    `json:"version" db:"version" gorm:"not null;size:20;default:'1.0'"`

	// Security
	Salt         string    `json:"salt" db:"salt" gorm:"not null;size:64"` // Salt for hashing
	IterationCount int    `json:"iterationCount" db:"iteration_count" gorm:"not null;default:100000"`

	// Metadata
	CreatedAt    time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
	LastUsedAt   *time.Time `json:"lastUsedAt" db:"last_used_at" gorm:"index"`
	UsageCount   int64     `json:"usageCount" db:"usage_count" gorm:"default:0"`

	// Associations
	Player       PlayerProfile `json:"player,omitempty" gorm:"foreignKey:PlayerID"`
}

// TableName returns the table name for RecoveryPhrase
func (RecoveryPhrase) TableName() string {
	return "recovery_phrases"
}

// Validate validates the recovery phrase
func (rp *RecoveryPhrase) Validate() error {
	if rp.PhraseHash == "" {
		return fmt.Errorf("phrase hash is required")
	}
	if rp.WordCount != 12 && rp.WordCount != 18 && rp.WordCount != 24 {
		return fmt.Errorf("word count must be 12, 18, or 24")
	}
	if rp.Salt == "" {
		return fmt.Errorf("salt is required")
	}
	if rp.IterationCount < 10000 {
		return fmt.Errorf("iteration count must be at least 10000")
	}
	return nil
}

// VerifyPhrase verifies a recovery phrase against the stored hash
func (rp *RecoveryPhrase) VerifyPhrase(phrase string) (bool, error) {
	// This would implement PBKDF2 hashing with the salt and compare to stored hash
	// For now, return false as a placeholder
	return false, nil
}

// RecordUsage records that the recovery phrase was used
func (rp *RecoveryPhrase) RecordUsage() {
	now := time.Now()
	rp.LastUsedAt = &now
	rp.UsageCount++
}