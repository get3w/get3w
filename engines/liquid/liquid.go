package liquid

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/get3w/get3w/engines/liquid/core"
	"github.com/get3w/get3w/engines/liquid/parser"
)

// Liquid contains parameters of value
type Liquid struct {
	config *core.Configuration
	Path   string
}

// New returns an instance of l
func New(path string) *Liquid {
	l := &Liquid{
		Path: path,
	}
	l.config = parser.Configure().IncludeHandler(l.includeHandler)
	return l
}

func (l *Liquid) includeHandler(name string, writer io.Writer, data map[string]interface{}) {
	name = strings.Trim(name, "{")
	name = strings.Trim(name, "}")
	path := filepath.Join(l.Path, "_includes", strings.Replace(name, "..", "", -1))
	if _, err := os.Stat(path); err == nil {
		template, _ := parser.ParseFile(path, nil)
		template.Render(writer, data)
	}
}

// Parse string
func (l *Liquid) Parse(templateCotent string, data map[string]interface{}) (string, error) {
	t, err := parser.ParseString(templateCotent, l.config)
	if err != nil {
		return "", err
	}
	b := bytes.NewBuffer(make([]byte, 0))
	t.Render(b, data)
	return cleanContent(b.String()), nil
}

var reg, _ = regexp.Compile("{{.*}}")

func cleanContent(val string) string {
	return reg.ReplaceAllString(val, "")
}
