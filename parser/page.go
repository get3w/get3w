package parser

import (
	"bytes"
	"fmt"
	"strings"

	"gopkg.in/yaml.v2"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/russross/blackfriday"
)

// UnmarshalPage parse string to page
func UnmarshalPage(summary *get3w.PageSummary, data string) *get3w.Page {
	page := &get3w.Page{}

	ext := GetExt(summary.TemplateURL)
	if ext == "" {
		page.Sections = strings.Split(summary.TemplateURL, ",")
	} else if ext == ExtMD {
		page.TemplateContent = data
	} else if ext == ExtYML {
		yaml.Unmarshal([]byte(data), page)
	} else {
		page.TemplateContent = data
	}

	page.Name = summary.Name
	page.TemplateURL = summary.TemplateURL
	page.PageURL = summary.PageURL

	return page
}

func getPageHead(config *get3w.Config, page *get3w.Page) string {
	var buffer bytes.Buffer
	resourceURL := "http://cdn.get3w.com"

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

func getPageBody(config *get3w.Config, page *get3w.Page, sections map[string]*get3w.Section) string {
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

// ParsePage parse page and returns content
func ParsePage(config *get3w.Config, page *get3w.Page, sections map[string]*get3w.Section) string {
	parsedContent := ""
	ext := GetExt(page.TemplateURL)
	if ext == ExtHTML {
		parsedContent = page.TemplateContent
	} else {
		bodyContent := ""
		if ext == ExtMD {
			bodyContent = fmt.Sprintf("%s", blackfriday.MarkdownCommon([]byte(page.TemplateContent)))
		} else {
			bodyContent = getPageBody(config, page, sections)
		}
		parsedContent = fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
%s</head>
<body>
%s</body>
</html>`, getPageHead(config, page), bodyContent)
	}

	return parsedContent
}
