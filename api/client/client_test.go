package client

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGet(t *testing.T) {
	err := get("local/local", "_test")
	assert.Nil(t, err)
}

func TestBuild(t *testing.T) {
	err := build("_test")
	assert.Nil(t, err)
}
