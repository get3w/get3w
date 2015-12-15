package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

var s, _ = NewLocalSite("../local")

func TestGetSections(t *testing.T) {
	sections := s.GetSections(nil)

	assert.NotNil(t, sections)
	assert.NotZero(t, len(sections))
}
