package client

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPull(t *testing.T) {
	err := pull("../../sample", "local")
	assert.Nil(t, err)
}
