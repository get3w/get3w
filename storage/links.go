package storage

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
)

var (
	regexOuter = regexp.MustCompile(`\[([^\]]+)\]\(([^\)]+)\)`)
	regexInner = regexp.MustCompile(`([^'"]+)\s+['"]([^'"]+)['"]|([^'"]+)`)
)

func (parser *Parser) loadSiteLinks(loadDefault bool) {
	var links []*get3w.Link

	path := parser.key(KeyLinks)
	if parser.Storage.IsExist(path) {
		data, _ := parser.Storage.Read(path)
		links = parser.loadSiteLinksByString(data)
	} else {
		files, _ := parser.Storage.GetFiles(parser.prefix(""))
		links = parser.loadSiteLinksByFiles(files)

		if loadDefault {
			for _, defaultLink := range parser.Default.Links {
				isExist := false
				for _, link := range links {
					if link.Path == defaultLink.Path {
						isExist = true
						break
					}
				}
				if !isExist {
					links = append(links, defaultLink)
				}
			}
		}
	}

	parser.Current.Links = links
}

func (parser *Parser) loadSiteLinksByString(data []byte) []*get3w.Link {
	links := []*get3w.Link{}

	lines := strings.Split(string(data), "\n")
	var previousSpaceNum int
	var previousParent *get3w.Link

	for _, line := range lines {
		if !strings.HasPrefix(strings.TrimSpace(line), "*") {
			continue
		}

		name, path, url, ok := getLineElements(line)
		if !ok {
			continue
		}

		spaceNum := strings.Index(line, "*")
		link := &get3w.Link{
			Name: name,
			Path: path,
			URL:  url,
		}

		var parent *get3w.Link
		if previousSpaceNum == spaceNum {
			parent = previousParent
		} else {
			parent = getParentLink(spaceNum, links)
		}

		if parent == nil {
			links = append(links, link)
		} else {
			parent.Children = append(parent.Children, link)
		}

		previousSpaceNum = spaceNum
		previousParent = parent
	}

	return links
}

func (parser *Parser) loadSiteLinksByFiles(files []*get3w.File) []*get3w.Link {
	links := []*get3w.Link{}

	for _, file := range files {
		if file.IsDir || file.Name == KeyReadme {
			continue
		}
		ext := getExt(file.Name)
		if ext == ExtHTML || ext == ExtMD {
			link := &get3w.Link{
				Name: strings.TrimRight(file.Name, ext),
				Path: file.Name,
				URL:  file.Name,
			}
			links = append(links, link)
		}
	}

	return links
}

func getLineElements(line string) (name, path, url string, ok bool) {
	arrOuter := regexOuter.FindStringSubmatch(line)
	if len(arrOuter) != 3 || arrOuter[0] == "" || arrOuter[1] == "" || arrOuter[2] == "" {
		return "", "", "", false
	}

	arrInner := regexInner.FindStringSubmatch(arrOuter[2])
	if len(arrInner) != 4 || arrInner[0] == "" {
		return "", "", "", false
	}

	name, path, url = arrOuter[1], "", ""
	if arrInner[3] == "" {
		path, url = strings.TrimSpace(arrInner[1]), strings.TrimSpace(arrInner[2])
	} else {
		path = strings.TrimSpace(arrInner[3])
	}
	if url == "" {
		url = getPageURL(name, path)
	}

	if name == "" || path == "" || url == "" {
		return "", "", "", false
	}

	return name, path, url, true
}

func getPageURL(name, path string) string {
	pageURL := name + ExtHTML
	ext := getExt(path)
	if ext == ExtMD {
		pageURL = strings.Replace(path, ExtMD, ExtHTML, 1)
	} else if ext == ExtHTML {
		pageURL = path
	}
	return pageURL
}

func getParentLink(spaceNum int, links []*get3w.Link) *get3w.Link {
	if spaceNum == 0 || len(links) == 0 {
		return nil
	}
	link := links[len(links)-1]
	for i := 0; i < spaceNum; i++ {
		if len(link.Children) == 0 {
			break
		}
		link = link.Children[len(link.Children)-1]
	}
	return link
}

// marshalLink parse page link slice to string
func marshalLink(links []*get3w.Link) string {
	lines := []string{}
	lines = append(lines, getLinkString(0, links))

	retval := ""
	for _, line := range lines {
		retval += line + "\n"
	}
	return retval + "\n"
}

func getLinkString(level int, links []*get3w.Link) string {
	retval := ""
	for _, link := range links {
		prefix := ""
		for i := 0; i < level; i++ {
			prefix += "\t"
		}
		if link.URL == getPageURL(link.Name, link.Path) {
			retval += prefix + fmt.Sprintf("* [%s](%s)\n", link.Name, link.Path)
		} else {
			retval += prefix + fmt.Sprintf(`* [%s](%s "%s")\n`, link.Name, link.Path, link.URL)
		}

		if len(link.Children) > 0 {
			retval += getLinkString(level+1, link.Children)
		}
	}
	return retval
}
