package storage

import (
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

// ParsePage the parsedContent
func (parser *Parser) ParsePage(layoutContent string, page *get3w.Page, paginator *get3w.Paginator) (string, error) {
	if layoutContent == "" {
		layoutContent = page.Content
	}

	parsedContent := layoutContent
	if parsedContent == "" {
		return "", nil
	}

	dataSite := parser.Current.AllParameters
	dataPage := page.AllParameters
	dataPaginator := structs.Map(paginator)

	if len(page.Sections) > 0 {
		dataPage["sections"] = parser.getSectionsHTML(parser.Config, page)
		// if parsedContent == "" {
		// 	parsedContent += fmt.Sprintf(defaultFormatHTML, getDefaultHead(parser.Config, page), sectionsHTML)
		// } else {
		// 	parsedContent += sectionsHTML
		// }
	}

	data := map[string]interface{}{
		"site":      dataSite,
		"page":      dataPage,
		"paginator": dataPaginator,
	}

	if strings.ToLower(parser.Config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(parser.Path)
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
