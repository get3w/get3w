package parser

import (
	"fmt"
	"strings"

	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/packages/liquid"
)

// ParsePage the parsedContent
func ParsePage(rootPath, template string, config *get3w.Config, page *get3w.Page, sections map[string]*get3w.Section, docs []map[string]string) string {
	if template == "" {
		template = page.Content
	}

	parsedContent := template
	if len(page.Sections) > 0 {
		sectionsHTML := getSectionsHTML(config, page, sections)
		if parsedContent == "" {
			parsedContent += fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
%s</head>
<body>
%s</body>
</html>`, getDefaultHead(config, page), sectionsHTML)
		} else {
			parsedContent += sectionsHTML
		}
	}

	if parsedContent == "" {
		return ""
	}

	data := map[string]interface{}{
		"site": structs.Map(config),
		"page": structs.Map(page),
		"docs": docs,
	}

	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(rootPath)
		data["content"] = parser.Parse(page.Content, data)
		parsedContent = parser.Parse(parsedContent, data)
	}

	return parsedContent
}
