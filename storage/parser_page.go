package storage

import (
	"fmt"
	"strings"

	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/packages/liquid"
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

// ParseChannel the parsedContent
func (parser *Parser) ParseChannel(template string, channel *get3w.Channel, paginator *get3w.Paginator) (string, error) {
	if template == "" {
		template = channel.Content
	}

	parsedContent := template
	if len(channel.Sections) > 0 {
		sectionsHTML := getSectionsHTML(parser.Config, channel, parser.Current.Sections)
		if parsedContent == "" {
			parsedContent += fmt.Sprintf(defaultFormatHTML, getDefaultHead(parser.Config, channel), sectionsHTML)
		} else {
			parsedContent += sectionsHTML
		}
	}

	if parsedContent == "" {
		return "", nil
	}

	data := map[string]interface{}{
		"site":      parser.Current.AllParameters,
		"page":      channel.AllParameters,
		"paginator": structs.Map(paginator),
	}

	if strings.ToLower(parser.Config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(parser.Path)
		content, err := parser.Parse(channel.Content, data)
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
