package client

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBuild(t *testing.T) {
	err := build("../../sample")
	assert.Nil(t, err)
}
