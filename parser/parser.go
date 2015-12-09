package parser

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser/liquid"
)

// template engines
const (
	TemplateEngineLiquid = "liquid"
)

func getSectionsHTML(config *get3w.Config, page *get3w.Page, sections map[string]*get3w.Section) string {
	var buffer bytes.Buffer

	for _, sectionName := range page.Sections {
		section, ok := sections[sectionName]
		if !ok {
			continue
		}

		if section.CSS != "" {
			buffer.WriteString(fmt.Sprintf(`<style>
%s
</style>
`, strings.Replace(section.CSS, ".this", "#"+section.ID, -1)))
		}
		if section.HTML != "" {
			buffer.WriteString(fmt.Sprintf(`<section id="%s">
%s
</section>
`, section.ID, section.HTML))
		}
		if section.JS != "" {
			buffer.WriteString(fmt.Sprintf(`<script>
%s
</script>
`, section.JS))
		}
	}

	return buffer.String()
}

func getDefaultHead(config *get3w.Config, page *get3w.Page) string {
	var buffer bytes.Buffer
	resourceURL := "http://cdn.get3w.net"

	title := page.Title
	if title == "" {
		title = config.Title
	}
	if title == "" {
		title = page.Name
	}

	keywords := page.Keywords
	if keywords == "" {
		keywords = config.Keywords
	}

	description := page.Description
	if description == "" {
		description = config.Description
	}

	buffer.WriteString(`<meta charset="utf-8">
`)
	buffer.WriteString(`<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
`)
	buffer.WriteString(`<meta name="viewport" content="width=device-width, initial-scale=1">
`)
	if len(keywords) > 0 {
		buffer.WriteString(fmt.Sprintf(`<meta name="keywords" content="%s"/>
`, keywords))
	}
	if len(description) > 0 {
		buffer.WriteString(fmt.Sprintf(`<meta name="description" content="%s"/>
`, description))
	}
	buffer.WriteString(fmt.Sprintf(`<title>%s</title>
`, title))
	buffer.WriteString(fmt.Sprintf(`<link href="%s/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
`, resourceURL))
	buffer.WriteString(fmt.Sprintf(`<link href="%s/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
`, resourceURL))
	buffer.WriteString(fmt.Sprintf(`<link href="%s/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
`, resourceURL))

	return buffer.String()
}

// ParsePage the parsedContent
func ParsePage(path string, config *get3w.Config, page *get3w.Page, sections map[string]*get3w.Section, contents []map[string]string) string {
	var parsedContent string
	if page.Template != "" {
		parsedContent = page.Template
	} else {
		parsedContent = page.Document
	}

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
		"site":     config,
		"page":     page,
		"contents": contents,
		"document": page.Document,
	}

	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.NewParser(path)
		parsedContent = parser.Parse(parsedContent, data)
	}

	return parsedContent
}

// ParseContent the templateContent
func ParseContent(path string, config *get3w.Config, page *get3w.Page, content map[string]string) string {
	parsedContent := page.ContentTemplate
	if parsedContent == "" {
		return ""
	}

	data := map[string]interface{}{
		"site":    config,
		"page":    page,
		"content": content,
	}

	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.NewParser(path)
		parsedContent = parser.Parse(parsedContent, data)
	}

	return parsedContent
}
