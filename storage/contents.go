package storage

import (
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/repos"
	"github.com/russross/blackfriday"
)

// getContentKey get html file key by sectionName
func (site *Site) getContentKey(contentFolder, fileName string) string {
	return site.GetSourceKey(repos.PrefixContents, contentFolder, fileName)
}

// GetContents get content models by contentName
func (site *Site) GetContents(page *get3w.Page) ([]map[string]string, error) {
	if site.contents == nil {
		site.contents = make(map[string][]map[string]string)
	}

	prefix := site.GetSourcePrefix(repos.PrefixContents, page.ContentFolder)

	contents, ok := site.contents[strings.ToLower(prefix)]
	if !ok {
		contents = []map[string]string{}
		files, _ := site.GetAllFiles(prefix)
		for _, file := range files {
			if file.IsDir {
				continue
			}
			data := make(map[string]string)
			data["name"] = removeExt(file.Name)
			data["title"] = data["name"]
			data["last_modified"] = file.LastModified
			data["content"] = site.getContent(file)

			contents = append(contents, data)
		}
		site.contents[strings.ToLower(prefix)] = contents
	}

	return contents, nil
}

func (site *Site) getContent(file *get3w.File) string {
	templateContent, _ := site.Read(site.GetSourceKey(file.Path))
	if templateContent == nil {
		return ""
	}

	var parsedContent string

	ext := getExt(file.Name)
	if ext == ExtMD {
		parsedContent = string(blackfriday.MarkdownCommon([]byte(templateContent)))
	} else {
		parsedContent = string(templateContent)
	}

	return parsedContent
}
