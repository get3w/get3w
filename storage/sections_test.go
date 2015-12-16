package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetSections(t *testing.T) {
	sections := localParser.Current.Sections

	assert.NotNil(t, sections)
	assert.NotZero(t, len(sections))
}
