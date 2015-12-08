package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

var s, _ = NewLocalSite("../sample")

func TestGetConfig(t *testing.T) {
	config, err := s.GetConfig()

	assert.Nil(t, err)
	assert.NotNil(t, config)
	assert.Equal(t, config.Title, "title")
}

func TestGetPages(t *testing.T) {
	pages, err := s.GetPages()

	assert.Nil(t, err)
	assert.NotNil(t, pages)
	assert.Equal(t, len(pages), 6)
}

func TestGetSections(t *testing.T) {
	sections, err := s.GetSections()

	assert.Nil(t, err)
	assert.NotNil(t, sections)
	assert.Equal(t, len(sections), 10)
}
