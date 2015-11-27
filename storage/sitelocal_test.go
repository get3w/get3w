package storage

import (
	"testing"

	"github.com/get3w/get3w/parser"
	"github.com/stretchr/testify/assert"
)

var s, _ = NewLocalSite("sample")

func TestGetKey(t *testing.T) {
	assert.Equal(t, s.GetKey("SUMMARY.md"), "SUMMARY.md")
	assert.Equal(t, s.GetKey("/SUMMARY.md"), "SUMMARY.md")
}

func TestGetConfigKey(t *testing.T) {
	assert.Equal(t, s.GetConfigKey(), "CONFIG.yml")
}

func TestGetSummaryKey(t *testing.T) {
	assert.Equal(t, s.GetSummaryKey(), "SUMMARY.md")
}

func TestGetWWWRootKey(t *testing.T) {
	assert.Equal(t, s.GetWWWRootKey("index.html"), "_wwwroot/index.html")
}

func TestGetSectionKey(t *testing.T) {
	assert.Equal(t, s.GetSectionKey(""), "_sections")
	assert.Equal(t, s.GetSectionKey("section"+parser.ExtHTML), "_sections/section.html")
}

func TestGetPreviewKey(t *testing.T) {
	assert.Equal(t, s.GetPreviewKey(""), "_preview")
	assert.Equal(t, s.GetPreviewKey("preview"+parser.ExtHTML), "_preview/preview.html")
}

func TestGetConfig(t *testing.T) {
	config := s.GetConfig()
	assert.NotNil(t, config)
	assert.Equal(t, config.Title, "title")
}

func TestGetSummaries(t *testing.T) {
	summaries := s.GetSummaries()
	assert.NotNil(t, summaries)
	assert.Equal(t, len(summaries), 4)
}

func TestGetSections(t *testing.T) {
	sections := s.GetSections()
	assert.NotNil(t, sections)
	assert.Equal(t, len(sections), 10)
}
