package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

var s = NewLocalSite("test")

func TestGetPageKey(t *testing.T) {
	assert.Equal(t, s.GetPageKey("Homepage"), "_pages/Homepage.yml")
	assert.Equal(t, s.GetPageKey("/Homepage"), "_pages/Homepage.yml")
	assert.Equal(t, s.GetPageKey("/Homepage/"), "_pages/Homepage.yml")
}

func TestBuild(t *testing.T) {
	s.DeleteFile("index.html")
	s.Build(nil)
	assert.True(t, s.IsExist("index.html"))
}
