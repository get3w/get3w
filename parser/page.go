package parser

import (
	"fmt"
	"strings"

	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/packages/liquid"
)

// ParsePage the parsedContent
func ParsePage(rootPath, template string, config *get3w.Config, configVars map[string]interface{}, page *get3w.Page, sections map[string]*get3w.Section, posts []*get3w.Post) (string, error) {
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
		return "", nil
	}

	data := map[string]interface{}{
		"site":  configVars,
		"page":  structs.Map(page),
		"posts": posts,
	}

	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(rootPath)
		content, err := parser.Parse(page.Content, data)
		if err != nil {
			return "", err
		}
		data["content"] = content

		if page.Paginate > 0 {
			data["paginator"] = &get3w.Paginator{
				Posts: posts,
			}
		}
		parsedContent, err = parser.Parse(parsedContent, data)
		if err != nil {
			return "", err
		}
	}

	return parsedContent, nil
}
