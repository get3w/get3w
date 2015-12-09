package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

var s, _ = NewLocalSite("../local")

func TestGetPages(t *testing.T) {
	pages := s.GetPages()

	assert.NotNil(t, pages)
	assert.NotZero(t, len(pages))
}

func TestGetSections(t *testing.T) {
	sections := s.GetSections()

	assert.NotNil(t, sections)
	assert.NotZero(t, len(sections))
}
