package storage

import (
	"fmt"
	"math"

	"github.com/fatih/structs"
	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"gopkg.in/yaml.v2"
)

// LoadSiteLinks load links for current site
func (parser *Parser) LoadSiteLinks() {
	links := []*get3w.Link{}

	for _, summary := range parser.Current.LinkSummaries {
		page := parser.getLink(summary)
		links = append(links, page)
	}

	parser.Current.Links = links
}

func (parser *Parser) getLink(summary *get3w.LinkSummary) *get3w.Link {
	link := &get3w.Link{}

	data, _ := parser.Storage.Read(parser.key(summary.Path))

	front, content := fmatter.ReadRaw(data)
	if len(front) > 0 {
		yaml.Unmarshal(front, link)
	}

	ext := getExt(summary.Path)
	link.Content = getStringByExt(ext, content)

	link.Name = summary.Name
	link.Path = summary.Path
	if link.URL == "" {
		link.URL = summary.URL
	}
	link.Posts = parser.GetPosts(link.PostPath)

	if len(summary.Children) > 0 {
		for _, child := range summary.Children {
			childLink := parser.getLink(child)
			link.Children = append(link.Children, childLink)
		}
	}

	vars := make(map[string]interface{})
	if len(front) > 0 {
		yaml.Unmarshal(front, vars)
	}
	link.AllParameters = structs.Map(link)
	for key, val := range vars {
		if _, ok := link.AllParameters[key]; !ok {
			link.AllParameters[key] = val
		}
	}

	return link
}

func getPaginatorPath(page int, url string) string {
	if page == 1 {
		return url
	}
	return fmt.Sprintf("%s%d%s", removeExt(url), page, getExt(url))
}

func (parser *Parser) getLinkPaginators(page *get3w.Link) []*get3w.Paginator {
	paginators := []*get3w.Paginator{}
	perPage := page.Paginate
	totalPosts := len(page.Posts)
	if perPage <= 0 || perPage >= totalPosts {
		paginator := &get3w.Paginator{
			Page:             1,
			PerPage:          perPage,
			Posts:            page.Posts,
			TotalPosts:       totalPosts,
			TotalPages:       1,
			PreviousPage:     0,
			PreviousPagePath: "",
			NextPage:         0,
			NextPagePath:     "",
			Path:             page.URL,
		}
		paginators = append(paginators, paginator)
	} else {
		totalPages := int(math.Ceil(float64(totalPosts) / float64(perPage)))
		for i := 1; i <= totalPages; i++ {
			previousPage := i - 1
			if previousPage < 0 {
				previousPage = 0
			}
			nextPage := i + 1
			if nextPage > totalPages {
				nextPage = 0
			}
			paginator := &get3w.Paginator{
				Page:             i,
				PerPage:          perPage,
				Posts:            page.Posts[perPage*(i-1) : perPage*i],
				TotalPosts:       totalPosts,
				TotalPages:       totalPages,
				PreviousPage:     previousPage,
				PreviousPagePath: getPaginatorPath(previousPage, page.URL),
				NextPage:         nextPage,
				NextPagePath:     getPaginatorPath(nextPage, page.URL),
				Path:             getPaginatorPath(i, page.URL),
			}
			paginators = append(paginators, paginator)
		}
	}
	return paginators
}

// WriteLink write content to page file
func (parser *Parser) WriteLink(link *get3w.Link) error {
	data, err := fmatter.Write(link, []byte(link.Content))
	if err != nil {
		return err
	}
	return parser.Storage.Write(parser.key(link.Path), data)
}

// DeleteLink delete page file
func (parser *Parser) DeleteLink(summary *get3w.LinkSummary) error {
	return parser.Storage.Delete(parser.key(summary.Path))
}
