package files

import (
	"encoding/base64"
	"net/http"
	"time"

	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"

	"github.com/labstack/echo"
)

// Edit file content
func Edit(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")
	path := c.P(2)

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()

	input := &get3w.FileEditInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app, err := appDAO.GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	var dst []byte
	base64.StdEncoding.Encode(dst, []byte(input.Content))
	parser.Storage.Write(path, dst)

	lastModified := timeutils.ToString(time.Now())
	err = appDAO.UpdateUpdatedAt(app.Owner, app.Name, lastModified)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	output := &get3w.FileEditOutput{
		LastModified: lastModified,
	}
	return c.JSON(http.StatusOK, output)
}
