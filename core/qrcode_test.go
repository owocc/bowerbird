package core

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func qrMatrixHash(matrix [][]bool) string {
	var b strings.Builder
	for _, row := range matrix {
		for _, dark := range row {
			if dark {
				b.WriteByte('#')
			} else {
				b.WriteByte('.')
			}
		}
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:])
}

func TestEncodeQRCodeKnownVectors(t *testing.T) {
	// Expected hashes come from Kazuhiko Arase's reference QRCode generator
	// (the implementation this encoder is ported from), error correction M.
	tests := []struct {
		data    string
		modules int
		hash    string
	}{
		{"hello", 21, "4ae45e0e6f6aff64ff50becd5e25ebd623563528e81b8d7c8440faac4898bc00"},
		{"bowerbird://pair?data=test", 25, "4f89ed6d4055cad18845aecd860d76d31adaeea7d6a4dd44814a672f3b11802f"},
		{
			"bowerbird://pair?data=%7B%22v%22%3A1%2C%22name%22%3A%22Bowerbird%22%2C%22ips%22%3A%5B%22192.168.1.12%22%2C%2210.0.0.5%22%5D%2C%22port%22%3A17878%2C%22code%22%3A%22123456%22%7D",
			53,
			"0d0798991a4a10888db4e2049708f13e7fac25c8cc5fa86f4f6a2f80895fdbcc",
		},
	}
	for _, tt := range tests {
		matrix, err := encodeQRCode([]byte(tt.data), qrECMedium)
		if err != nil {
			t.Fatalf("encodeQRCode(%q) failed: %v", tt.data, err)
		}
		if len(matrix) != tt.modules {
			t.Fatalf("encodeQRCode(%q) has %d modules, want %d", tt.data, len(matrix), tt.modules)
		}
		if got := qrMatrixHash(matrix); got != tt.hash {
			t.Fatalf("encodeQRCode(%q) hash %s, want %s", tt.data, got, tt.hash)
		}
	}
}

func TestEncodeQRCodeTooLong(t *testing.T) {
	if _, err := encodeQRCode(make([]byte, 3000), qrECMedium); err == nil {
		t.Fatal("expected data larger than version 40 to be rejected")
	}
}
