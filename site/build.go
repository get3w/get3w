package site

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// Build all pages in the app.
func (site *Site) Build(app *get3w.App) {
	if app == nil {
		return
	}

	config := site.GetConfig()
	for _, pageName := range config.Pages {
		page := site.GetPage(pageName)
		site.generatePage(page, config, app)
	}
}

func (site *Site) getPageHead(page *get3w.Page, config *get3w.Config, app *get3w.App) string {
	var buffer bytes.Buffer
	resourceURL := "http://cdn.get3w.com"

	title := page.Title
	if title == "" {
		title = config.Title
	}
	if title == "" {
		title = app.Name
	}

	keywords := page.Keywords
	if keywords == "" {
		keywords = config.Keywords
	}
	if keywords == "" {
		keywords = app.Tags
	}

	description := page.Description
	if description == "" {
		description = config.Description
	}
	if description == "" {
		description = app.Description
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

func (site *Site) getPageBody(page *get3w.Page, config *get3w.Config, app *get3w.App) string {
	var buffer bytes.Buffer

	for _, sectionName := range page.Sections {
		if stringutils.Contains(config.Sections, sectionName) {
			section := &get3w.Section{
				ID:   stringutils.Base64ForURLEncode(sectionName),
				Name: sectionName,
				HTML: site.ReadSectionHTML(sectionName),
				CSS:  site.ReadSectionCSS(sectionName),
				JS:   site.ReadSectionJS(sectionName),
			}

			if len(section.CSS) > 0 {
				buffer.WriteString(fmt.Sprintf(`<style>
%s
</style>
`, strings.Replace(section.CSS, ".this", "#"+section.ID, -1)))
			}
			if len(section.HTML) > 0 {
				buffer.WriteString(fmt.Sprintf(`<section id="%s">
%s
</section>
`, section.ID, section.HTML))
			}
			if len(section.JS) > 0 {
				buffer.WriteString(fmt.Sprintf(`<script>
%s
</script>
`, section.JS))
			}
		}
	}

	return buffer.String()
}

func (site *Site) generatePage(page *get3w.Page, config *get3w.Config, app *get3w.App) {
	if page == nil || page.Sections == nil || len(page.Sections) == 0 {
		return
	}

	parsedContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
%s</head>
<body>
%s</body>
</html>`, site.getPageHead(page, config, app), site.getPageBody(page, config, app))

	url := page.URL
	if url == "" {
		if page.Type == get3w.PageHomepage {
			url = "index.html"
		} else {
			url = page.Name + ".html"
		}
	}

	key := site.GetKey(url)
	site.WriteObject(key, parsedContent)
}
