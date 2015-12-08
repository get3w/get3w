package parser

import (
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser/liquid"
)

// template engines
const (
	TemplateEngineLiquid = "liquid"
)

// ParsePage the templateContent
func ParsePage(path, templateContent string, config *get3w.Config, page *get3w.Page, contents []map[string]string) string {
	parsedContent := templateContent
	if templateContent == "" {
		return parsedContent
	}

	data := map[string]interface{}{
		"site":     config,
		"page":     page,
		"contents": contents,
	}

	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.NewParser(path)
		parsedContent = parser.Parse(templateContent, data)
	}

	return parsedContent
}

// ParseContent the templateContent
func ParseContent(path, templateContent string, config *get3w.Config, page *get3w.Page, content map[string]string) string {
	parsedContent := templateContent
	if templateContent == "" {
		return parsedContent
	}

	data := map[string]interface{}{
		"site":    config,
		"page":    page,
		"content": content,
	}

	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.NewParser(path)
		parsedContent = parser.Parse(templateContent, data)
	}

	return parsedContent
}
