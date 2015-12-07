package storage

import (
	"testing"

	"github.com/get3w/get3w/parser"
	"github.com/stretchr/testify/assert"
)

var s, _ = NewLocalSite("../sample")

func TestGetSourceKey(t *testing.T) {
	assert.Equal(t, s.GetSourceKey("SUMMARY.md"), "SUMMARY.md")
	assert.Equal(t, s.GetSourceKey("/SUMMARY.md"), "SUMMARY.md")
}

func TestGetConfigKey(t *testing.T) {
	assert.Equal(t, s.GetConfigKey(), "CONFIG.yml")
}

func TestGetSummaryKey(t *testing.T) {
	assert.Equal(t, s.GetSummaryKey(), "SUMMARY.md")
}

func TestGetSectionKey(t *testing.T) {
	assert.Equal(t, s.GetSectionKey(""), "_sections")
	assert.Equal(t, s.GetSectionKey("section"+parser.ExtHTML), "_sections/section.html")
}

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
