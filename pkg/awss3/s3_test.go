package awss3

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetFiles(t *testing.T) {
	service := NewService("apps.get3w.com")
	files, err := service.GetFiles("wwwwww", "/")
	assert.Equal(t, err, nil)
	assert.True(t, len(files) > 0)
}
