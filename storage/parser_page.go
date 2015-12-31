package storage

import (
	"fmt"
	"strings"

	"github.com/fatih/structs"
	"github.com/get3w/get3w"
	"github.com/get3w/get3w/engines/liquid"
)

const (
	defaultFormatHTML = `<!DOCTYPE html>
<html lang="en">
<head>
%s</head>
<body>
%s</body>
</html>`
)

// ParseLink the parsedContent
func (parser *Parser) ParseLink(template string, link *get3w.Link, paginator *get3w.Paginator) (string, error) {
	if template == "" {
		template = link.Content
	}

	parsedContent := template
	if len(link.Sections) > 0 {
		sectionsHTML := getSectionsHTML(parser.Config, link, parser.Current.Sections)
		if parsedContent == "" {
			parsedContent += fmt.Sprintf(defaultFormatHTML, getDefaultHead(parser.Config, link), sectionsHTML)
		} else {
			parsedContent += sectionsHTML
		}
	}

	if parsedContent == "" {
		return "", nil
	}

	data := map[string]interface{}{
		"site":      parser.Current.AllParameters,
		"page":      link.AllParameters,
		"paginator": structs.Map(paginator),
	}

	if strings.ToLower(parser.Config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(parser.Path)
		content, err := parser.Parse(link.Content, data)
		if err != nil {
			return "", err
		}
		data["content"] = content

		parsedContent, err = parser.Parse(parsedContent, data)
		if err != nil {
			return "", err
		}
	}

	return parsedContent, nil
}
