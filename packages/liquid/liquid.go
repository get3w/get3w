package liquid

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/get3w/get3w/packages/liquid/core"
	"github.com/get3w/get3w/packages/liquid/parser"
	"github.com/get3w/get3w/repos"
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
	// not sure if this is good enough, but do be mindful of directory traversal attacks
	name = strings.Trim(name, "{")
	name = strings.Trim(name, "}")
	path := filepath.Join(l.Path, repos.PrefixIncludes, strings.Replace(name, "..", "", -1))
	if _, err := os.Stat(path); err == nil {
		template, _ := parser.ParseFile(path, nil)
		template.Render(writer, data)
	}
}

// Parse string
func (l *Liquid) Parse(templateCotent string, data map[string]interface{}) string {
	t, err := parser.ParseString(templateCotent, l.config)
	if err != nil {
		fmt.Println(err)
	}
	b := bytes.NewBuffer(make([]byte, 0))

	t.Render(b, data)

	return b.String()
}
