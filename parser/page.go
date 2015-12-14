package parser

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

// ParsePage the parsedContent
func ParsePage(rootPath, template string, config *get3w.Config, sections map[string]*get3w.Section, page *get3w.Page, paginator *get3w.Paginator) (string, error) {
	if template == "" {
		template = page.Content
	}

	parsedContent := template
	if len(page.Sections) > 0 {
		sectionsHTML := getSectionsHTML(config, page, sections)
		if parsedContent == "" {
			parsedContent += fmt.Sprintf(defaultFormatHTML, getDefaultHead(config, page), sectionsHTML)
		} else {
			parsedContent += sectionsHTML
		}
	}

	if parsedContent == "" {
		return "", nil
	}

	data := map[string]interface{}{
		"site":      config.All,
		"page":      page.All,
		"paginator": structs.Map(paginator),
	}

	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(rootPath)
		content, err := parser.Parse(page.Content, data)
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
