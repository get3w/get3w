package liquid

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/get3w/get3w/repos"
	"github.com/karlseguin/liquid"
	"github.com/karlseguin/liquid/core"
)

// Parser contains parameters of value
type Parser struct {
	config *core.Configuration
	Path   string
}

// NewParser returns an instance of parser
func NewParser(path string) *Parser {
	parser := &Parser{
		Path: path,
	}
	parser.config = liquid.Configure().IncludeHandler(parser.includeHandler)
	return parser
}

func (parser *Parser) includeHandler(name string, writer io.Writer, data map[string]interface{}) {
	// not sure if this is good enough, but do be mindful of directory traversal attacks
	name = strings.Trim(name, "{")
	name = strings.Trim(name, "}")
	path := filepath.Join(parser.Path, repos.PrefixIncludes, strings.Replace(name, "..", "", -1))
	if _, err := os.Stat(path); err == nil {
		template, _ := liquid.ParseFile(path, nil)
		template.Render(writer, data)
	}
}

// name is equal to the paramter passed to include
// data is the data available to the template

// Parse string
func (parser *Parser) Parse(templateCotent string, data map[string]interface{}) string {
	t, _ := liquid.ParseString(templateCotent, parser.config)
	b := bytes.NewBuffer(make([]byte, 0))

	t.Render(b, data)

	return b.String()
}
