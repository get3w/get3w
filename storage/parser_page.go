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

// ParseLink the parsedContent
func (parser *Parser) ParseLink(layoutContent string, link *get3w.Link, paginator *get3w.Paginator) (string, error) {
	if layoutContent == "" {
		layoutContent = link.Content
	}

	parsedContent := layoutContent
	if parsedContent == "" {
		return "", nil
	}

	dataSite := parser.Current.AllParameters
	dataPage := link.AllParameters
	dataPaginator := structs.Map(paginator)

	if len(link.Sections) > 0 {
		dataPage["sections"] = getSectionsHTML(parser.Config, link, parser.Current.Sections)
		// if parsedContent == "" {
		// 	parsedContent += fmt.Sprintf(defaultFormatHTML, getDefaultHead(parser.Config, link), sectionsHTML)
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
