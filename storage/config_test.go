package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

var parsers []*Parser
var localParser *Parser
var s3Parser *Parser

func init() {
	localParser, _ = NewLocalParser("../local")
	s3Parser, _ = NewS3Parser("get3w-app-source", "get3w-app-destination", "local", "local")
	parsers = append(parsers, localParser)
	parsers = append(parsers, s3Parser)
}

func TestLoadSiteParameters(t *testing.T) {
	for _, parser := range parsers {
		parser.loadSiteParameters(false)
		assert.NotNil(t, parser.Current.AllParameters)
	}
}
