package storage

import (
	"path/filepath"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// loadSiteSections get site's sections
func (parser *Parser) loadSiteSections(loadDefault bool) {
	sections := make(map[string]*get3w.Section)
	files, err := parser.Storage.GetFiles(parser.prefix(PrefixSections))
	if err != nil {
		parser.Current.Sections = sections
		return
	}

	for _, file := range files {
		ext := filepath.Ext(file.Path)
		if ext != ExtHTML && ext != ExtCSS && ext != ExtJS {
			continue
		}
		sectionName := strings.Replace(file.Name, ext, "", 1)
		section := sections[sectionName]
		if section == nil {
			section = &get3w.Section{
				ID:   stringutils.Base64ForURLEncode(sectionName),
				Name: sectionName,
			}
		}
		if ext == ExtHTML {
			section.HTML, _ = parser.ReadSectionContent(file)
		} else if ext == ExtCSS {
			section.CSS, _ = parser.ReadSectionContent(file)
		} else if ext == ExtJS {
			section.JS, _ = parser.ReadSectionContent(file)
		}

		sections[sectionName] = section
	}

	if loadDefault {
		for key, section := range parser.Default.Sections {
			if _, ok := sections[key]; !ok {
				sections[key] = section
			}
		}
	}

	parser.Current.Sections = sections
}

// sectionKey get html file key by sectionName
func (parser *Parser) sectionKey(relatedURL string) string {
	return parser.key(PrefixSections, relatedURL)
}

// ReadSectionContent get section file content
func (parser *Parser) ReadSectionContent(file *get3w.File) (string, error) {
	keyName := parser.sectionKey(file.Name)
	str, err := parser.Storage.Read(keyName)
	if err != nil {
		return "", err
	}

	return string(str), nil
}

// SaveSection write content to section
func (parser *Parser) SaveSection(section *get3w.Section) error {
	if err := parser.Storage.Write(parser.sectionKey(section.Name+ExtHTML), []byte(section.HTML)); err != nil {
		return err
	}
	if err := parser.Storage.Write(parser.sectionKey(section.Name+ExtCSS), []byte(section.CSS)); err != nil {
		return err
	}
	if err := parser.Storage.Write(parser.sectionKey(section.Name+ExtJS), []byte(section.JS)); err != nil {
		return err
	}
	return nil
	// 	previewHTML := `<!DOCTYPE html>
	// <html lang="en">
	// <head>
	//     <meta charset="utf-8">
	//     <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
	//     <meta name="viewport" content="width=device-width, initial-scale=1">
	//     <title>` + section.Name + `</title>
	//     <link href="http://cdn.get3w.com/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
	//     <link href="` + section.Name + `.css" rel="stylesheet">
	// </head>
	// <body>
	// <section class="this">
	//     ` + section.HTML + `
	// </section>
	// <script src="` + section.Name + `.js"></script>
	// </body>
	// </html>`
	// 	parser.WritePreview(parser.getSectionKey(section.Name+parser.ExtHTML), []byte(previewHTML))
}

// DeleteSection delete section files
func (parser *Parser) DeleteSection(sectionName string) error {
	if err := parser.Storage.Delete(parser.sectionKey(sectionName + ExtHTML)); err != nil {
		return err
	}
	if err := parser.Storage.Delete(parser.sectionKey(sectionName + ExtCSS)); err != nil {
		return err
	}
	if err := parser.Storage.Delete(parser.sectionKey(sectionName + ExtJS)); err != nil {
		return err
	}
	return nil
}
