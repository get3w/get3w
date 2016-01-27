package storage

import (
	"bytes"
	"path"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v2"

	"golang.org/x/net/html"

	log "github.com/Sirupsen/logrus"
	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"github.com/get3w/get3w/pkg/stringutils"
	"github.com/russross/blackfriday"
)

// system file or folder names
const (
	ExtHTML = ".html"
	ExtMD   = ".md"
	ExtCSS  = ".css"
	ExtJS   = ".js"
	ExtPNG  = ".png"
)

var (
	localOnlyPrefixes []string
)

func init() {
	localOnlyPrefixes = []string{
		PrefixLogs,
	}
}

// getExt returns the lowercase file name extension used by path.
func getExt(path string) string {
	return strings.ToLower(filepath.Ext(path))
}

// isExt returns true if path without ext
func isExt(path string) bool {
	return getExt(path) != ""
}

// removeExt get rid of ext
func removeExt(path string) string {
	return strings.TrimSuffix(path, filepath.Ext(path))
}

func getStringByExt(ext string, val []byte) string {
	if ext == ExtMD {
		return string(blackfriday.MarkdownCommon(val))
	}
	return string(val)
}

func isUnderscoreOrDotPrefix(path string) bool {
	paths := strings.Split(path, "/")
	for _, p := range paths {
		if strings.HasPrefix(p, "_") || strings.HasPrefix(p, ".") {
			return true
		}
	}
	return false
}

func renderNode(node *html.Node) (string, error) {
	var buf bytes.Buffer
	err := html.Render(&buf, node)
	if err != nil {
		return "", err
	}
	return buf.String(), nil
}

// IsLocalFile returns true if the file is local only
func (parser *Parser) IsLocalFile(file *get3w.File) bool {
	if strings.HasPrefix(file.Path, parser.Config.Destination) {
		return true
	}
	if stringutils.HasPrefixIgnoreCase(localOnlyPrefixes, file.Path) {
		return true
	}
	return false
}

func (parser *Parser) readAll(key ...string) ([]byte, error) {
	filePath := parser.key(key...)
	if data, ok := parser.cacheFiles[filePath]; ok {
		return data, nil
	}
	data, err := parser.Storage.Read(filePath)
	if err != nil {
		return nil, err
	}
	parser.cacheFiles[filePath] = data
	return data, nil
}

func (parser *Parser) read(frontmatter interface{}, key ...string) ([]byte, []byte) {
	data, _ := parser.readAll(key...)
	front, remaining := fmatter.ReadRaw(data)
	if len(front) > 0 {
		yaml.Unmarshal(front, frontmatter)
	}
	return front, remaining
}

func (parser *Parser) readRemaining(key ...string) []byte {
	data, _ := parser.readAll(key...)
	_, remaining := fmatter.ReadRaw(data)
	return remaining
}

func (parser *Parser) prefix(prefix ...string) string {
	return parser.Storage.GetSourcePrefix(parser.Current.Path, path.Join(prefix...))
}

func (parser *Parser) key(key ...string) string {
	return parser.Storage.GetSourceKey(parser.Current.Path, path.Join(key...))
}

func (parser *Parser) destinationPrefix(prefix ...string) string {
	return parser.Storage.GetDestinationPrefix(parser.Current.Path, path.Join(prefix...))
}

func (parser *Parser) destinationKey(key ...string) string {
	return parser.Storage.GetDestinationKey(parser.Current.Path, path.Join(key...))
}

// LogWarn write content to log file
func (parser *Parser) LogWarn(templateURL, pageURL, warning string) {
	if parser.logger != nil {
		parser.logger.WithFields(log.Fields{
			"templateURL": templateURL,
			"pageURL":     pageURL,
		}).Warn(warning)
	}
}

// LogError write content to log file
func (parser *Parser) LogError(pageURL string, err error) {
	if parser.logger != nil {
		parser.logger.WithFields(log.Fields{
			"pageURL": pageURL,
		}).Error(err.Error())
	}
}
